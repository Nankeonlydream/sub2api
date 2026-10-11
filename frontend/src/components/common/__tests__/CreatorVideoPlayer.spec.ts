import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CreatorVideoPlayer from '../CreatorVideoPlayer.vue'

describe('CreatorVideoPlayer', () => {
  it('keeps loading and playback controls mutually exclusive across source changes', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:first' }, slots: { loading: '<div class="loading">正在加载视频</div>' } })
    try {
      const oldVideo = wrapper.get('video')
      await oldVideo.trigger('loadeddata')
      expect(wrapper.find('.video-play-toggle').exists()).toBe(true)
      await wrapper.setProps({ src: 'blob:second' })
      const currentVideo = wrapper.get('video')
      expect(currentVideo.element).not.toBe(oldVideo.element)
      expect(wrapper.find('.video-play-toggle').exists()).toBe(false)
      expect(wrapper.find('.loading').exists()).toBe(false)
      await currentVideo.trigger('loadedmetadata')
      await oldVideo.trigger('loadeddata')
      expect(wrapper.find('.video-play-toggle').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(150)
      expect(wrapper.find('.loading').exists()).toBe(true)
      expect(wrapper.find('.video-play-toggle').exists()).toBe(false)
      await currentVideo.trigger('loadeddata')
      expect(wrapper.find('.loading').exists()).toBe(false)
      expect(wrapper.find('.video-play-toggle').exists()).toBe(true)
      await wrapper.setProps({ src: 'blob:third' })
      await wrapper.get('video').trigger('loadeddata')
      await vi.advanceTimersByTimeAsync(150)
      expect(wrapper.find('.loading').exists()).toBe(false)
      expect(wrapper.find('.video-play-toggle').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('plays, pauses and replays through the cover without showing native controls', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    const video = wrapper.get<HTMLVideoElement>('video')
    let paused = true
    Object.defineProperty(video.element, 'paused', { get: () => paused })
    Object.defineProperty(video.element, 'duration', { value: 8 })
    const play = vi.spyOn(video.element, 'play').mockImplementation(async () => {
      paused = false
      video.element.dispatchEvent(new Event('play'))
    })
    const pause = vi.spyOn(video.element, 'pause').mockImplementation(() => {
      paused = true
      video.element.dispatchEvent(new Event('pause'))
    })
    await video.trigger('loadedmetadata')
    await video.trigger('loadeddata')
    expect(wrapper.get('.video-badge').text()).toContain('0:08')
    await wrapper.get('[aria-label="播放视频"]').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.classes()).toContain('is-playing')
    await wrapper.get('[aria-label="暂停视频"]').trigger('click')
    expect(pause).toHaveBeenCalledTimes(1)
    expect(wrapper.classes()).not.toContain('is-playing')
    Object.defineProperty(video.element, 'ended', { value: true })
    video.element.currentTime = 8
    await video.trigger('ended')
    await wrapper.get('[aria-label="播放视频"]').trigger('click')
    expect(video.element.currentTime).toBe(0)
    await video.trigger('pointerenter', { pointerType: 'mouse' })
    await video.trigger('pointerdown', { pointerType: 'touch' })
    expect(video.element.controls).toBe(false)
    wrapper.unmount()
  })

  it('keeps loading feedback separate and allows retry after a rejected play', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' }, slots: { loading: '<div class="loading">正在加载视频</div>' } })
    expect(wrapper.find('.video-play-toggle').exists()).toBe(false)
    expect(wrapper.find('.loading').exists()).toBe(false)
    const video = wrapper.get<HTMLVideoElement>('video')
    await video.trigger('loadeddata')
    const play = vi.spyOn(video.element, 'play').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce()
    await wrapper.get('.video-play-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('请点击重试')
    await wrapper.get('.video-play-toggle').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.video-playback-error').exists()).toBe(false)
    await video.trigger('loadstart')
    expect(wrapper.emitted('loadstart')).toHaveLength(1)
    wrapper.unmount()
  })

  it('opens the whole player in fullscreen so its custom controls remain available', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    await wrapper.get('video').trigger('loadeddata')
    const enterFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(wrapper.element, 'requestFullscreen', { value: enterFullscreen })
    await wrapper.get('[aria-label="全屏观看"]').trigger('click')
    expect(enterFullscreen).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
