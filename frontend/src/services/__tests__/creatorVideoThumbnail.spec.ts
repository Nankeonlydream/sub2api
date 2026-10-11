import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCreatorVideoThumbnail } from '../creatorVideoThumbnail'

describe('creatorVideoThumbnail', () => {
  let videos: HTMLVideoElement[]
  let drawImage: ReturnType<typeof vi.fn>
  beforeEach(() => {
    videos = []
    drawImage = vi.fn()
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () {
      if (this.hasAttribute('src') && !videos.includes(this as HTMLVideoElement)) {
        Object.defineProperties(this, {
          videoWidth: { value: 1280 }, videoHeight: { value: 720 },
          duration: { value: 2 }, readyState: { value: 2 }, seeking: { value: false },
        })
        videos.push(this as HTMLVideoElement)
      }
    })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local-video-cover'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,video-cover')
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('reads a persisted local video, seeks to its first visible frame and caches a 128px cover', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' })
    const first = getCreatorVideoThumbnail('local-cover:1', blob, new AbortController().signal)
    await flushPromises()
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    const video = videos[0]
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBe(0.1)
    video.dispatchEvent(new Event('seeked'))
    expect(await first).toBe('data:image/webp;base64,video-cover')
    expect(drawImage).toHaveBeenCalledWith(video, 280, 0, 720, 720, 0, 0, 128, 128)
    expect(video.hasAttribute('src')).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-video-cover')
    await getCreatorVideoThumbnail('local-cover:1', blob, new AbortController().signal)
    expect(videos).toHaveLength(1)
  })

  it('cancels offscreen work, skips queued rows and releases the local object URL', async () => {
    const active = new AbortController()
    const skipped = new AbortController()
    const first = getCreatorVideoThumbnail('cancel-cover', new Blob(['video']), active.signal)
    const second = getCreatorVideoThumbnail('skip-cover', '/skip.mp4', skipped.signal)
    const third = getCreatorVideoThumbnail('next-cover', '/next.mp4', new AbortController().signal)
    await flushPromises()
    skipped.abort()
    active.abort()
    expect(await first).toBe('')
    expect(await second).toBe('')
    await flushPromises()
    expect(videos).toHaveLength(2)
    expect(videos[1].getAttribute('src')).toBe('/next.mp4')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-video-cover')
    videos[1].dispatchEvent(new Event('error'))
    expect(await third).toBe('')
  })

  it('releases a stalled decoder and continues processing the next row', async () => {
    vi.useFakeTimers()
    const first = getCreatorVideoThumbnail('timeout-cover', new Blob(['video']), new AbortController().signal)
    const second = getCreatorVideoThumbnail('after-timeout-cover', '/next.mp4', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await first).toBe('')
    expect(videos).toHaveLength(2)
    videos[1].dispatchEvent(new Event('error'))
    expect(await second).toBe('')
  })
})
