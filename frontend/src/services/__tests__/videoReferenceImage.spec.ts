import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_VIDEO_REFERENCE_FILE_BYTES,
  MAX_VIDEO_REFERENCE_SOURCE_BYTES,
  optimizeVideoReferenceImage,
} from '../videoReferenceImage'

describe('optimizeVideoReferenceImage', () => {
  const drawImage = vi.fn()
  const context = {
    drawImage,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D
  let close: ReturnType<typeof vi.fn>

  beforeEach(() => {
    close = vi.fn()
    drawImage.mockReset()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1024,
      height: 768,
      close,
    }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps an already compliant image unchanged after checking its pixels', async () => {
    const file = new File(['image'], 'ready.png', { type: 'image/png' })

    await expect(optimizeVideoReferenceImage(file)).resolves.toEqual({
      file,
      width: 1024,
      height: 768,
      optimized: false,
    })
    expect(close).toHaveBeenCalledOnce()
  })

  it('resizes a long edge to 2048px and encodes the result as WebP', async () => {
    const bitmap = { width: 4096, height: 2048, close }
    vi.mocked(createImageBitmap).mockResolvedValue(bitmap as unknown as ImageBitmap)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob([new ArrayBuffer(1024)], { type: 'image/webp' }))
    })
    const file = new File(['image'], 'wide.png', { type: 'image/png' })

    const result = await optimizeVideoReferenceImage(file)

    expect(result).toMatchObject({ width: 2048, height: 1024, optimized: true })
    expect(result.file.name).toBe('wide.webp')
    expect(result.file.type).toBe('image/webp')
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1024)
    expect(close).toHaveBeenCalledOnce()
  })

  it('lowers encoding quality until the optimized file is no larger than 3MB', async () => {
    const qualities: number[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, _type, quality) => {
      qualities.push(Number(quality))
      const size = qualities.length === 1 ? MAX_VIDEO_REFERENCE_FILE_BYTES + 1 : 2 * 1024 * 1024
      callback(new Blob([new ArrayBuffer(size)], { type: 'image/webp' }))
    })
    const file = new File([new ArrayBuffer(MAX_VIDEO_REFERENCE_FILE_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' })

    const result = await optimizeVideoReferenceImage(file)

    expect(qualities).toEqual([0.86, 0.76])
    expect(result.file.size).toBe(2 * 1024 * 1024)
    expect(result.optimized).toBe(true)
  })

  it('rejects an image whose width or height is below 8px', async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 7, height: 512, close } as unknown as ImageBitmap)
    const file = new File(['image'], 'too-thin.png', { type: 'image/png' })

    await expect(optimizeVideoReferenceImage(file)).rejects.toThrow('宽高均不能低于 8px')
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects a source larger than 10MB before decoding it', async () => {
    const file = new File([new ArrayBuffer(MAX_VIDEO_REFERENCE_SOURCE_BYTES + 1)], 'too-large.png', { type: 'image/png' })

    await expect(optimizeVideoReferenceImage(file)).rejects.toThrow('超过 10MB')
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
