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

  it('shows a light shimmer skeleton instead of a dark overlay while a slow video loads', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    try {
      expect(wrapper.find('.video-skeleton').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(150)
      const skeleton = wrapper.get('.video-skeleton')
      expect(skeleton.attributes('role')).toBe('status')
      expect(skeleton.text()).toBe('正在加载视频')
      await wrapper.get('video').trigger('loadeddata')
      expect(wrapper.find('.video-skeleton').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('fills a frame with the video ratio so no sub-pixel black line shows, but keeps contain for other ratios', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    try {
      const video = wrapper.get<HTMLVideoElement>('video')
      let frameHeight = 336.188
      Object.defineProperty(video.element, 'videoWidth', { value: 1280 })
      Object.defineProperty(video.element, 'videoHeight', { value: 720 })
      Object.defineProperty(wrapper.element, 'clientWidth', { get: () => 598 })
      Object.defineProperty(wrapper.element, 'clientHeight', { get: () => Math.round(frameHeight) })
      await video.trigger('loadedmetadata')
      expect(video.classes()).toContain('fills-frame')

      // Height capped by max-height: the picture must not be cropped.
      frameHeight = 280
      await video.trigger('loadedmetadata')
      expect(video.classes()).not.toContain('fills-frame')

      // A new source starts with contain again until its own size is known.
      frameHeight = 336.188
      await video.trigger('loadedmetadata')
      await wrapper.setProps({ src: 'blob:next' })
      expect(wrapper.get('video').classes()).not.toContain('fills-frame')
    } finally {
      wrapper.unmount()
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
    // Before the first play only the centre button is shown; the bottom bar stays hidden.
    expect(wrapper.classes()).not.toContain('has-started')
    await wrapper.get('[aria-label="播放视频"]').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.classes()).toContain('is-playing')
    expect(wrapper.classes()).toContain('has-started')
    // The duration badge belongs to the cover and leaves once playback starts.
    expect(wrapper.find('.video-badge').exists()).toBe(false)
    await wrapper.get('[aria-label="暂停视频"]').trigger('click')
    expect(pause).toHaveBeenCalledTimes(1)
    expect(wrapper.classes()).not.toContain('is-playing')
    // Pausing keeps the bottom bar instead of bringing the centre button back.
    expect(wrapper.classes()).toContain('has-started')
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

  it('pauses the previous player when another one starts so only one plays at a time', async () => {
    const mountPlayer = (src: string) => {
      const wrapper = mount(CreatorVideoPlayer, { props: { src } })
      const video = wrapper.get<HTMLVideoElement>('video')
      let paused = true
      Object.defineProperty(video.element, 'paused', { get: () => paused })
      vi.spyOn(video.element, 'play').mockImplementation(async () => {
        paused = false
        video.element.dispatchEvent(new Event('play'))
      })
      const pause = vi.spyOn(video.element, 'pause').mockImplementation(() => {
        paused = true
        video.element.dispatchEvent(new Event('pause'))
      })
      return { wrapper, video, pause, isPaused: () => paused }
    }
    const first = mountPlayer('blob:first')
    const second = mountPlayer('blob:second')
    try {
      await first.video.trigger('loadeddata')
      await second.video.trigger('loadeddata')
      await first.wrapper.get('.video-play-toggle').trigger('click')
      await flushPromises()
      expect(first.isPaused()).toBe(false)
      await second.wrapper.get('.video-play-toggle').trigger('click')
      await flushPromises()
      expect(second.isPaused()).toBe(false)
      expect(first.pause).toHaveBeenCalledTimes(1)
      expect(first.isPaused()).toBe(true)
      expect(first.wrapper.get('.creator-video-player').classes()).not.toContain('is-playing')
    } finally {
      first.wrapper.unmount()
      second.wrapper.unmount()
    }
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

  it('toggles sound per player and starts every new player with sound on', async () => {
    const first = mount(CreatorVideoPlayer, { props: { src: 'blob:first' } })
    await first.get('video').trigger('loadeddata')
    expect(first.get<HTMLVideoElement>('video').element.muted).toBe(false)
    await first.get('[aria-label="关闭声音"]').trigger('click')
    expect(first.get<HTMLVideoElement>('video').element.muted).toBe(true)
    expect(first.get('.video-sound').attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('creator-video-muted')).toBeNull()
    const second = mount(CreatorVideoPlayer, { props: { src: 'blob:second' } })
    await second.get('video').trigger('loadeddata')
    expect(second.get<HTMLVideoElement>('video').element.muted).toBe(false)
    first.unmount()
    second.unmount()
  })

  it('adjusts volume with the slider and keeps it in step with mute', async () => {
    localStorage.removeItem('creator-video-muted')
    localStorage.removeItem('creator-video-volume')
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:volume' } })
    const video = wrapper.get<HTMLVideoElement>('video')
    await video.trigger('loadeddata')
    const slider = wrapper.get<HTMLInputElement>('.video-volume-slider')
    expect(video.element.volume).toBe(1)
    await slider.setValue('0.4')
    expect(video.element.volume).toBeCloseTo(0.4)
    expect(video.element.muted).toBe(false)
    await slider.setValue('0')
    expect(video.element.muted).toBe(true)
    expect(wrapper.emitted('update:muted')?.at(-1)).toEqual([true])
    await wrapper.get('[aria-label="打开声音"]').trigger('click')
    expect(video.element.muted).toBe(false)
    expect(video.element.volume).toBe(1)
    wrapper.unmount()
    localStorage.removeItem('creator-video-muted')
    localStorage.removeItem('creator-video-volume')
  })

  it('mutes only the player that was toggled', async () => {
    localStorage.removeItem('creator-video-muted')
    const first = mount(CreatorVideoPlayer, { props: { src: 'blob:first' } })
    const second = mount(CreatorVideoPlayer, { props: { src: 'blob:second' } })
    await first.get('video').trigger('loadeddata')
    await second.get('video').trigger('loadeddata')
    await first.get('[aria-label="关闭声音"]').trigger('click')
    expect(first.get<HTMLVideoElement>('video').element.muted).toBe(true)
    expect(second.get<HTMLVideoElement>('video').element.muted).toBe(false)
    expect(second.get('.video-sound').attributes('aria-pressed')).toBe('false')
    first.unmount()
    second.unmount()
    localStorage.removeItem('creator-video-muted')
  })

  it('reveals controls on the first tap during playback and hides them again after a moment', async () => {
    vi.useFakeTimers()
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    try {
      const video = wrapper.get<HTMLVideoElement>('video')
      let paused = true
      Object.defineProperty(video.element, 'paused', { get: () => paused })
      vi.spyOn(video.element, 'play').mockImplementation(async () => {
        paused = false
        video.element.dispatchEvent(new Event('play'))
      })
      const pause = vi.spyOn(video.element, 'pause').mockImplementation(() => {
        paused = true
        video.element.dispatchEvent(new Event('pause'))
      })
      await video.trigger('loadeddata')
      await wrapper.get('.video-play-toggle').trigger('click')
      await flushPromises()
      expect(wrapper.classes()).toContain('is-playing')
      await vi.advanceTimersByTimeAsync(2500)
      expect(wrapper.classes()).not.toContain('controls-visible')

      await wrapper.get('.video-sound').trigger('pointerdown', { pointerType: 'touch' })
      await wrapper.get('.video-sound').trigger('click')
      expect(wrapper.classes()).toContain('controls-visible')
      expect(video.element.muted).toBe(false)
      await wrapper.get('.video-play-toggle').trigger('pointerdown', { pointerType: 'touch' })
      await wrapper.get('.video-play-toggle').trigger('click')
      expect(pause).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2500)
      expect(wrapper.classes()).not.toContain('controls-visible')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('seeks with the progress bar, skips back and forward, and cycles playback speed', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    const video = wrapper.get<HTMLVideoElement>('video')
    Object.defineProperty(video.element, 'duration', { value: 15 })
    await video.trigger('loadedmetadata')
    await video.trigger('loadeddata')
    const times = () => wrapper.findAll('.video-time').map((node) => node.text())
    expect(times()).toEqual(['00:00', '00:15'])
    const progress = wrapper.get<HTMLInputElement>('.video-progress')
    progress.element.value = '7'
    await progress.trigger('input')
    expect(video.element.currentTime).toBe(7)
    expect(times()[0]).toBe('00:07')
    expect(progress.attributes('style')).toContain('--progress: 46.6')
    await wrapper.get('[aria-label="后退 5 秒"]').trigger('click')
    expect(video.element.currentTime).toBe(2)
    await wrapper.get('[aria-label="后退 5 秒"]').trigger('click')
    expect(video.element.currentTime).toBe(0)
    await progress.trigger('keydown', { key: 'ArrowRight' })
    expect(video.element.currentTime).toBe(5)
    video.element.currentTime = 13
    await wrapper.get('[aria-label="前进 5 秒"]').trigger('click')
    expect(video.element.currentTime).toBe(15)
    const speed = wrapper.get('.video-speed')
    expect(speed.text()).toBe('1x')
    await speed.trigger('click')
    expect(speed.text()).toBe('1.5x')
    expect(video.element.playbackRate).toBe(1.5)
    wrapper.unmount()
  })

  it('pauses while the progress thumb is held and resumes playback on release', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    const video = wrapper.get<HTMLVideoElement>('video')
    let paused = true
    Object.defineProperty(video.element, 'paused', { get: () => paused })
    Object.defineProperty(video.element, 'duration', { value: 15 })
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
    await wrapper.get('[aria-label="播放视频"]').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    const progress = wrapper.get<HTMLInputElement>('.video-progress')
    await progress.trigger('pointerdown', { pointerType: 'mouse' })
    expect(pause).toHaveBeenCalledTimes(1)
    // The drag's pause is temporary, so the player still reads as playing.
    expect(wrapper.classes()).toContain('is-playing')
    progress.element.value = '4'
    await progress.trigger('input')
    expect(video.element.currentTime).toBe(4)
    expect(wrapper.findAll('.video-time')[0].text()).toBe('00:04')
    document.dispatchEvent(new Event('pointerup'))
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(paused).toBe(false)
    // Dragging while paused leaves the video paused on release.
    await wrapper.get('[aria-label="暂停视频"]').trigger('click')
    await progress.trigger('pointerdown', { pointerType: 'mouse' })
    progress.element.value = '6'
    await progress.trigger('input')
    document.dispatchEvent(new Event('pointerup'))
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(2)
    expect(wrapper.classes()).not.toContain('is-playing')
    wrapper.unmount()
  })

  it('lets each drag seek finish and then jumps to the newest position, landing exactly on release', async () => {
    const wrapper = mount(CreatorVideoPlayer, { props: { src: 'blob:video' } })
    const video = wrapper.get<HTMLVideoElement>('video')
    let seeking = false
    Object.defineProperty(video.element, 'seeking', { get: () => seeking })
    Object.defineProperty(video.element, 'duration', { value: 15 })
    const fastSeek = vi.fn((time: number) => { video.element.currentTime = Math.floor(time) })
    Object.defineProperty(video.element, 'fastSeek', { value: fastSeek })
    await video.trigger('loadedmetadata')
    await video.trigger('loadeddata')
    const progress = wrapper.get<HTMLInputElement>('.video-progress')
    await progress.trigger('pointerdown', { pointerType: 'mouse' })
    progress.element.value = '3.4'
    await progress.trigger('input')
    expect(fastSeek).toHaveBeenLastCalledWith(3.4)
    // While that seek is still running, newer positions are only remembered.
    seeking = true
    progress.element.value = '5.2'
    await progress.trigger('input')
    progress.element.value = '7.6'
    await progress.trigger('input')
    expect(fastSeek).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.video-time')[0].text()).toBe('00:07')
    seeking = false
    await video.trigger('seeked')
    expect(fastSeek).toHaveBeenCalledTimes(2)
    expect(fastSeek).toHaveBeenLastCalledWith(7.6)
    // fastSeek stopped on a keyframe at 7; release seeks precisely to the dropped position.
    document.dispatchEvent(new Event('pointerup'))
    expect(video.element.currentTime).toBe(7.6)
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
