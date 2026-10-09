import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CreatorImage from '../CreatorImage.vue'

describe('CreatorImage', () => {
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
})
