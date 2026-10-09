export const MAX_VIDEO_REFERENCE_SOURCE_MB = 10
export const MAX_VIDEO_REFERENCE_SOURCE_BYTES = MAX_VIDEO_REFERENCE_SOURCE_MB * 1024 * 1024
export const MAX_VIDEO_REFERENCE_FILE_MB = 3
export const MAX_VIDEO_REFERENCE_FILE_BYTES = MAX_VIDEO_REFERENCE_FILE_MB * 1024 * 1024
export const MAX_VIDEO_REFERENCE_TOTAL_MB = 15
export const MAX_VIDEO_REFERENCE_TOTAL_BYTES = MAX_VIDEO_REFERENCE_TOTAL_MB * 1024 * 1024
export const MAX_VIDEO_REFERENCE_LONG_EDGE = 2048
export const MIN_VIDEO_REFERENCE_SIDE = 8

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

export interface OptimizedVideoReferenceImage {
  file: File
  width: number
  height: number
  optimized: boolean
}

function imageLoadError(file: File) {
  return new Error(`${file.name} 无法读取，请确认图片内容完整`)
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file)
  const element = new Image()
  element.decoding = 'async'
  try {
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve()
      element.onerror = () => reject(imageLoadError(file))
      element.src = url
    })
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  return {
    source: element,
    width: element.naturalWidth,
    height: element.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Some browsers cannot decode every supported format through ImageBitmap.
    }
  }
  return decodeWithImageElement(file)
}

function canvasToWebP(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('浏览器无法压缩参考图'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

function outputFileName(name: string, mimeType: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'video-reference'
  return `${base}.${mimeType === 'image/webp' ? 'webp' : 'png'}`
}

export async function optimizeVideoReferenceImage(file: File): Promise<OptimizedVideoReferenceImage> {
  if (file.size > MAX_VIDEO_REFERENCE_SOURCE_BYTES) {
    throw new Error(`${file.name} 超过 ${MAX_VIDEO_REFERENCE_SOURCE_MB}MB`)
  }

  const decoded = await decodeImage(file)
  try {
    if (decoded.width < MIN_VIDEO_REFERENCE_SIDE || decoded.height < MIN_VIDEO_REFERENCE_SIDE) {
      throw new Error(`${file.name} 尺寸过小，宽高均不能低于 ${MIN_VIDEO_REFERENCE_SIDE}px`)
    }

    const initialScale = Math.min(1, MAX_VIDEO_REFERENCE_LONG_EDGE / Math.max(decoded.width, decoded.height))
    let width = Math.round(decoded.width * initialScale)
    let height = Math.round(decoded.height * initialScale)
    if (width < MIN_VIDEO_REFERENCE_SIDE || height < MIN_VIDEO_REFERENCE_SIDE) {
      throw new Error(`${file.name} 宽高比过大，压缩后短边会低于 ${MIN_VIDEO_REFERENCE_SIDE}px`)
    }
    if (initialScale === 1 && file.size <= MAX_VIDEO_REFERENCE_FILE_BYTES) {
      return { file, width, height, optimized: false }
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理参考图，请更换浏览器后重试')
    let quality = 0.86
    let blob: Blob | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width
      canvas.height = height
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(decoded.source, 0, 0, width, height)
      blob = await canvasToWebP(canvas, quality)
      if (blob.size <= MAX_VIDEO_REFERENCE_FILE_BYTES) break

      if (quality > 0.56) {
        quality = Math.max(0.56, quality - 0.1)
        continue
      }

      const scale = Math.max(0.72, Math.min(0.9, Math.sqrt(MAX_VIDEO_REFERENCE_FILE_BYTES / blob.size) * 0.94))
      const nextWidth = Math.floor(width * scale)
      const nextHeight = Math.floor(height * scale)
      if (nextWidth < MIN_VIDEO_REFERENCE_SIDE || nextHeight < MIN_VIDEO_REFERENCE_SIDE) break
      if (nextWidth === width && nextHeight === height) break
      width = nextWidth
      height = nextHeight
      quality = 0.8
    }

    if (!blob || blob.size > MAX_VIDEO_REFERENCE_FILE_BYTES) {
      throw new Error(`${file.name} 压缩后仍超过 ${MAX_VIDEO_REFERENCE_FILE_MB}MB，请换一张图片`)
    }

    const mimeType = blob.type === 'image/webp' ? 'image/webp' : 'image/png'
    const optimizedFile = new File([blob], outputFileName(file.name, mimeType), {
      type: mimeType,
      lastModified: file.lastModified,
    })
    return { file: optimizedFile, width, height, optimized: true }
  } finally {
    decoded.cleanup()
  }
}
