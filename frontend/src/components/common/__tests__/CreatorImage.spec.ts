import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreatorImage from '../CreatorImage.vue'

describe('CreatorImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([true, false])('uses CORS only when cross-origin isolation is %s', isolated => {
    vi.stubGlobal('crossOriginIsolated', isolated)
    const wrapper = mount(CreatorImage, { props: { src: 'https://cdn.example.test/image.png', alt: '作品' } })
    expect(wrapper.get('img').attributes('crossorigin')).toBe(isolated ? 'anonymous' : undefined)
    wrapper.unmount()
  })

  it('keeps the loading transition until decoding finishes, then allows preview', async () => {
    const wrapper = mount(CreatorImage, { props: { src: '/large.png', alt: '作品' } })
    let finishDecode!: () => void
    const decode = vi.fn(() => new Promise<void>(resolve => { finishDecode = resolve }))
    Object.defineProperty(wrapper.get('img').element, 'decode', { value: decode })
    await wrapper.get('img').trigger('load')
    expect(wrapper.get('[role="status"]').text()).toContain('正在加载图片')
    expect(wrapper.get('.creator-image-open').attributes('disabled')).toBeDefined()
    finishDecode()
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).toContain('is-ready')
    await wrapper.get('.creator-image-open').trigger('click')
    expect(wrapper.emitted('preview')).toHaveLength(1)
    wrapper.unmount()
  })

  it('ignores decoding a previous selection and supports retry after an error', async () => {
    const wrapper = mount(CreatorImage, { props: { src: '/first.png', alt: '作品' } })
    let finishDecode!: () => void
    Object.defineProperty(wrapper.get('img').element, 'decode', {
      value: () => new Promise<void>(resolve => { finishDecode = resolve }),
    })
    await wrapper.get('img').trigger('load')
    await wrapper.setProps({ src: '/second.png' })
    finishDecode()
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    const failedImage = wrapper.get('img').element
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('[role="alert"]').text()).toContain('图片加载失败')
    await wrapper.get('.creator-image-retry').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.get('img').element).not.toBe(failedImage)
    expect(wrapper.get('img').attributes('src')).toBe('/second.png')
    await wrapper.get('img').trigger('load')
    await flushPromises()
    expect(wrapper.get('img').classes()).toContain('is-ready')
    wrapper.unmount()
  })

  it('shows retry when decoding itself fails', async () => {
    const wrapper = mount(CreatorImage, { props: { src: '/broken.png', alt: '作品' } })
    Object.defineProperty(wrapper.get('img').element, 'decode', {
      value: () => Promise.reject(new Error('Invalid image data')),
    })
    await wrapper.get('img').trigger('load')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('skips the spinner and fade when a successfully displayed work is remounted or previewed', async () => {
    const props = { src: 'data:image/png;base64,original', alt: '作品', cacheKey: 'displayed-work:1:0' }
    const first = mount(CreatorImage, { props })
    expect(first.find('[role="status"]').exists()).toBe(true)
    await first.get('img').trigger('load')
    await flushPromises()
    first.unmount()

    vi.useFakeTimers()
    const second = mount(CreatorImage, { props: { ...props, preview: true } })
    expect(second.find('[role="status"]').exists()).toBe(false)
    expect(second.get('img').classes()).toContain('was-displayed')
    expect(second.get('img').classes()).not.toContain('is-ready')
    const decode = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(second.get('img').element, 'decode', { value: decode })
    await second.get('img').trigger('load')
    expect(decode).toHaveBeenCalledOnce()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(200)
    expect(second.find('[role="status"]').exists()).toBe(false)
    expect(second.get('img').classes()).toContain('is-ready')
    second.unmount()
  })

  it('animates a new selection but skips animation when switching back', async () => {
    const wrapper = mount(CreatorImage, { props: { src: '/switch-a.png', alt: '作品' } })
    await wrapper.get('img').trigger('load')
    await wrapper.setProps({ src: '/switch-b.png' })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    await wrapper.setProps({ src: '/switch-a.png' })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).toContain('was-displayed')
    wrapper.unmount()
  })

  it.each([false, true])('shows feedback for a previously displayed large image until it finishes decoding (preview=%s)', async preview => {
    vi.useFakeTimers()
    const props = { src: `/slow-cached-${preview}.png`, alt: '作品', preview }
    const first = mount(CreatorImage, { props })
    await first.get('img').trigger('load')
    first.unmount()
    const wrapper = mount(CreatorImage, { props })
    let finishDecode!: () => void
    Object.defineProperty(wrapper.get('img').element, 'decode', {
      value: () => new Promise<void>(resolve => { finishDecode = resolve }),
    })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).not.toContain('is-ready')
    await vi.advanceTimersByTimeAsync(150)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    await wrapper.get('img').trigger('load')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.get('img').classes()).not.toContain('is-ready')
    finishDecode()
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).toContain('is-ready')
    expect(wrapper.attributes('aria-busy')).toBe('false')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears delayed feedback on selection changes and unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorImage, { props: { src: '/timer-a.png', alt: '作品' } })
    await wrapper.get('img').trigger('load')
    await wrapper.setProps({ src: '/timer-b.png' })
    await wrapper.get('img').trigger('load')
    await wrapper.setProps({ src: '/timer-a.png' })
    await vi.advanceTimersByTimeAsync(100)
    await wrapper.setProps({ src: '/timer-b.png' })
    await vi.advanceTimersByTimeAsync(50)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let a late decode hide a load error', async () => {
    const wrapper = mount(CreatorImage, { props: { src: '/decode-error-race.png', alt: '作品' } })
    let finishDecode!: () => void
    Object.defineProperty(wrapper.get('img').element, 'decode', {
      value: () => new Promise<void>(resolve => { finishDecode = resolve }),
    })
    await wrapper.get('img').trigger('load')
    await wrapper.get('img').trigger('error')
    finishDecode()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('img').classes()).not.toContain('is-ready')
    wrapper.unmount()
  })

  it('invalidates a failed cached image and shows loading on explicit retry', async () => {
    const props = { src: '/cached-error.png', alt: '作品' }
    const first = mount(CreatorImage, { props })
    await first.get('img').trigger('load')
    first.unmount()
    const wrapper = mount(CreatorImage, { props })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('.creator-image-retry').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.get('img').classes()).not.toContain('was-displayed')
    wrapper.unmount()
  })

  it('does not remember an unfinished decode from an unmounted selection', async () => {
    const props = { src: '/unfinished.png', alt: '作品' }
    const first = mount(CreatorImage, { props })
    let resolveDecode!: () => void
    Object.defineProperty(first.get('img').element, 'decode', {
      value: () => new Promise<void>(resolve => { resolveDecode = resolve }),
    })
    await first.get('img').trigger('load')
    first.unmount()
    resolveDecode()
    await flushPromises()
    const second = mount(CreatorImage, { props })
    expect(second.find('[role="status"]').exists()).toBe(true)
    second.unmount()
  })
})
