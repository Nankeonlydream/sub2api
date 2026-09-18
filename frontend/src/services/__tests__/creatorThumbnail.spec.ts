import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCreatorThumbnail } from '../creatorThumbnail'

describe('creatorThumbnail', () => {
  let images: HTMLImageElement[]
  let drawImage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    images = []
    drawImage = vi.fn()
    vi.stubGlobal('Image', function () {
      const image = document.createElement('img')
      Object.defineProperties(image, { naturalWidth: { value: 4096 }, naturalHeight: { value: 2048 } })
      images.push(image)
      return image
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,thumbnail')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('serializes large image decoding, crops to 128px and reuses the small cached result', async () => {
    const first = getCreatorThumbnail('first:1', '/first.png', new AbortController().signal)
    const second = getCreatorThumbnail('second:1', '/second.png', new AbortController().signal)
    await flushPromises()
    expect(images).toHaveLength(1)
    images[0].dispatchEvent(new Event('load'))
    expect(await first).toBe('data:image/webp;base64,thumbnail')
    expect(drawImage).toHaveBeenCalledWith(images[0], 1024, 0, 2048, 2048, 0, 0, 128, 128)
    await flushPromises()
    expect(images).toHaveLength(2)
    expect(images[0].hasAttribute('src')).toBe(false)
    images[1].dispatchEvent(new Event('load'))
    await second
    await getCreatorThumbnail('first:1', '/first.png', new AbortController().signal)
    expect(images).toHaveLength(2)
  })

  it('cancels offscreen images and skips rows that leave the queue before decoding', async () => {
    const active = new AbortController()
    const queued = new AbortController()
    const first = getCreatorThumbnail('cancel:1', '/active.png', active.signal)
    const second = getCreatorThumbnail('skip:1', '/queued.png', queued.signal)
    const third = getCreatorThumbnail('continue:1', '/next.png', new AbortController().signal)
    await flushPromises()
    queued.abort()
    active.abort()
    expect(await first).toBe('')
    expect(await second).toBe('')
    await flushPromises()
    expect(images).toHaveLength(2)
    expect(images[1].getAttribute('src')).toBe('/next.png')
    images[1].dispatchEvent(new Event('error'))
    expect(await third).toBe('')
  })
})
