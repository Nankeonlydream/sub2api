import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatorVideoThumbnail from '../CreatorVideoThumbnail.vue'
import { getCreatorVideoThumbnail, isBlankCreatorVideoThumbnail } from '@/services/creatorVideoThumbnail'

vi.mock('@/services/creatorVideoThumbnail', () => ({ getCreatorVideoThumbnail: vi.fn(), isBlankCreatorVideoThumbnail: vi.fn() }))

describe('CreatorVideoThumbnail', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.mocked(getCreatorVideoThumbnail).mockReset().mockResolvedValue('data:image/webp;base64,cover')
    vi.mocked(isBlankCreatorVideoThumbnail).mockReset().mockReturnValue(false)
  })

  it('recaptures a saved cover that decodes as a blank frame and emits the replacement', async () => {
    vi.mocked(isBlankCreatorVideoThumbnail).mockReturnValueOnce(true)
    const blob = new Blob(['video'], { type: 'video/mp4' })
    const wrapper = mount(CreatorVideoThumbnail, { props: { cacheKey: 'blank', videoBlob: blob, thumbnail: 'data:image/webp;base64,blank' } })
    await flushPromises()
    await wrapper.get('img').trigger('load')
    await flushPromises()
    expect(wrapper.find('.video-thumbnail-play').exists()).toBe(false)
    expect(getCreatorVideoThumbnail).toHaveBeenCalledWith('blank', blob, expect.any(AbortSignal))
    expect(wrapper.emitted('ready')?.[0]).toEqual(['data:image/webp;base64,cover'])
    expect(wrapper.get('img').attributes('src')).toBe('data:image/webp;base64,cover')
    wrapper.unmount()
  })

  it('retries a failed extraction when the tab becomes visible again', async () => {
    vi.mocked(getCreatorVideoThumbnail).mockResolvedValueOnce('')
    const wrapper = mount(CreatorVideoThumbnail, { props: { cacheKey: 'retry', src: '/video.mp4' } })
    await flushPromises()
    expect(wrapper.find('.video-thumbnail-placeholder').classes()).not.toContain('is-loading')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(getCreatorVideoThumbnail).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('ready')?.[0]).toEqual(['data:image/webp;base64,cover'])
    wrapper.unmount()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows a persisted cover immediately without reading the video', async () => {
    const wrapper = mount(CreatorVideoThumbnail, { props: { cacheKey: 'saved', thumbnail: 'data:image/webp;base64,saved' } })
    await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBe('data:image/webp;base64,saved')
    expect(getCreatorVideoThumbnail).not.toHaveBeenCalled()
    await wrapper.get('img').trigger('load')
    expect(wrapper.find('.video-thumbnail-play').exists()).toBe(true)
    wrapper.unmount()
  })

  it('extracts a cover from the local Blob before opening the work and emits it for persistence', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' })
    const wrapper = mount(CreatorVideoThumbnail, { props: { cacheKey: 'blob', videoBlob: blob } })
    await flushPromises()
    expect(getCreatorVideoThumbnail).toHaveBeenCalledWith('blob', blob, expect.any(AbortSignal))
    expect(wrapper.emitted('ready')?.[0]).toEqual(['data:image/webp;base64,cover'])
    await wrapper.get('img').trigger('load')
    await wrapper.setProps({ thumbnail: 'data:image/webp;base64,cover' })
    expect(wrapper.attributes('aria-busy')).toBe('false')
    wrapper.unmount()
  })

  it('does not decode offscreen rows and cancels stale extraction when the row unmounts', async () => {
    let intersect!: (entries: Array<{ isIntersecting: boolean }>) => void
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof intersect) { intersect = callback }
      observe() {}
      disconnect() {}
    })
    let finish!: (thumbnail: string) => void
    vi.mocked(getCreatorVideoThumbnail).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(CreatorVideoThumbnail, { props: { cacheKey: 'visible', src: '/video.mp4' } })
    await flushPromises()
    expect(getCreatorVideoThumbnail).not.toHaveBeenCalled()
    intersect([{ isIntersecting: true }])
    await flushPromises()
    const signal = vi.mocked(getCreatorVideoThumbnail).mock.calls[0][2]
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    finish('data:image/webp;base64,stale')
    await flushPromises()
    expect(wrapper.emitted('ready')).toBeUndefined()
  })
})
