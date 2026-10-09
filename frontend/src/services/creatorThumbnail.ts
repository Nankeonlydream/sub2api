// Keep full-size images out of the history list. Decode only one thumbnail at a
// time, and skip queued work when its row has scrolled out of the virtual window.
const thumbnails = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()
const THUMBNAIL_SIZE = 128
const CACHE_LIMIT = 80

export function getCreatorThumbnail(key: string, source: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.resolve('')
  const cached = readCachedThumbnail(key)
  if (cached) return Promise.resolve(cached)
  const task = queue.then(async () => {
    if (signal.aborted) return ''
    const cached = readCachedThumbnail(key)
    if (cached) return cached
    const thumbnail = await resizeThumbnail(source, signal)
    if (thumbnail && !signal.aborted) {
      // Index by work revision, not the (potentially multi-megabyte) data URL.
      thumbnails.set(key, thumbnail)
      if (thumbnails.size > CACHE_LIMIT) thumbnails.delete(thumbnails.keys().next().value!)
    }
    return thumbnail
  })
  queue = task.catch(() => undefined)
  return task
}

function readCachedThumbnail(key: string): string | undefined {
  const cached = thumbnails.get(key)
  if (cached) {
    thumbnails.delete(key)
    thumbnails.set(key, cached)
  }
  return cached
}

function resizeThumbnail(source: string, signal: AbortSignal): Promise<string> {
  return new Promise(resolve => {
    let settled = false
    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    const finish = (result: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
      resolve(result)
    }
    const abort = () => finish('')
    const timeout = setTimeout(abort, 15000)
    signal.addEventListener('abort', abort, { once: true })
    image.onerror = abort
    image.onload = async () => {
      try {
        if (image.decode) await image.decode()
        if (settled) return
        const size = Math.min(image.naturalWidth, image.naturalHeight)
        if (!size || signal.aborted) return finish('')
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = THUMBNAIL_SIZE
        const context = canvas.getContext('2d')
        if (!context) return finish('')
        context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
        finish(canvas.toDataURL('image/webp', 0.8))
      } catch {
        finish('')
      }
    }
    image.src = source
  })
}
