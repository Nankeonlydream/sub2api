import { creatorDataUrlToBlob } from './creatorImageBlobs'

// Result cards are a few hundred CSS pixels wide, yet history keeps 4K originals
// as multi-megabyte data URLs. Parsing and decoding two of those on every
// selection makes switching works slow, so cards show a downscaled copy:
// decoded off the main thread once per work revision, kept as a short blob URL.
// Previews and downloads keep using the original.
// Cards are ~540 CSS px wide; 1280 keeps them sharp on 2x screens.
const DISPLAY_WIDTH = 1280
const CACHE_LIMIT = 40
const displayImages = new Map<string, Promise<string>>()
// Settled blob URLs, readable synchronously so a preview can paint at once.
const resolvedDisplayImages = new Map<string, string>()

/** Resolves to a blob URL, or '' when the original should be shown as-is. */
export function getCreatorDisplayImage(key: string, source: string): Promise<string> {
  const cached = displayImages.get(key)
  if (cached) {
    displayImages.delete(key)
    displayImages.set(key, cached)
    return cached
  }
  const task: Promise<string> = createDisplayImage(source).catch(() => '').then(url => {
    if (url && displayImages.get(key) === task) resolvedDisplayImages.set(key, url)
    return url
  })
  displayImages.set(key, task)
  if (displayImages.size > CACHE_LIMIT) {
    const [oldestKey, oldest] = displayImages.entries().next().value!
    displayImages.delete(oldestKey)
    resolvedDisplayImages.delete(oldestKey)
    void oldest.then(url => { if (url) URL.revokeObjectURL(url) })
  }
  return task
}

/** The downscaled blob URL if it has already been created, otherwise ''. */
export function peekCreatorDisplayImage(key: string): string {
  return resolvedDisplayImages.get(key) || ''
}

export function forgetCreatorDisplayImage(key: string): void {
  const cached = displayImages.get(key)
  if (!cached) return
  displayImages.delete(key)
  resolvedDisplayImages.delete(key)
  void cached.then(url => { if (url) URL.revokeObjectURL(url) })
}

async function createDisplayImage(source: string): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof URL.createObjectURL !== 'function') return ''
  const blob = creatorDataUrlToBlob(source)
  if (!blob) return ''
  // resizeWidth alone keeps the aspect ratio; the decoder scales off the main thread.
  const bitmap = await createImageBitmap(blob, { resizeWidth: DISPLAY_WIDTH, resizeQuality: 'high' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return URL.createObjectURL(blob)
    context.drawImage(bitmap, 0, 0)
    const resized = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9))
    return URL.createObjectURL(resized || blob)
  } finally {
    bitmap.close()
  }
}
