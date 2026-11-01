// Decode only visible history rows, one at a time. Keep small covers rather
// than media elements or full decoded frames in the in-memory cache.
const thumbnails = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

export function getCreatorVideoThumbnail(key: string, source: Blob | string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.resolve('')
  const task = queue.then(async () => {
    if (signal.aborted) return ''
    const cached = thumbnails.get(key)
    if (cached) return cached
    // Background tabs do not decode detached media; a long video job often
    // finishes while the user is elsewhere, so wait until the page is shown.
    await whenVisible(signal)
    if (signal.aborted) return ''
    const thumbnail = await captureFrame(source, signal)
    if (thumbnail && !signal.aborted) {
      thumbnails.set(key, thumbnail)
      if (thumbnails.size > 80) thumbnails.delete(thumbnails.keys().next().value!)
    }
    return thumbnail
  })
  queue = task.catch(() => undefined)
  return task
}

// Covers saved before blank-frame detection may be fully transparent and
// render as an empty tile; callers recapture those instead of showing them.
export function isBlankCreatorVideoThumbnail(image: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const context = canvas.getContext('2d')
    if (!context) return false
    context.drawImage(image, 0, 0, 16, 16)
    return isTransparent(context, 16)
  } catch { return false }
}

// Video frames are always opaque. A canvas left fully transparent means the
// decoder had not presented the frame yet when it was drawn.
function isTransparent(context: CanvasRenderingContext2D, size: number): boolean {
  const pixels = context.getImageData(0, 0, size, size).data
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) return false
  return true
}

function whenVisible(signal: AbortSignal): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve()
  return new Promise(resolve => {
    const check = () => {
      if (document.visibilityState === 'hidden' && !signal.aborted) return
      document.removeEventListener('visibilitychange', check)
      signal.removeEventListener('abort', check)
      resolve()
    }
    document.addEventListener('visibilitychange', check)
    signal.addEventListener('abort', check, { once: true })
  })
}

function captureFrame(source: Blob | string, signal: AbortSignal): Promise<string> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    let objectUrl = ''
    let settled = false
    let seekTime = 0
    let metadataReady = false
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    const finish = (result: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(result)
    }
    const abort = () => finish('')
    const timeout = setTimeout(abort, 10000)
    signal.addEventListener('abort', abort, { once: true })
    const capture = () => {
      if (settled || signal.aborted || !metadataReady || video.readyState < 2 || video.seeking) return
      if (Math.abs(video.currentTime - seekTime) > 0.05) return
      try {
        const size = Math.min(video.videoWidth, video.videoHeight)
        if (!size) return finish('')
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 128
        const context = canvas.getContext('2d')
        if (!context) return finish('')
        context.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 128, 128)
        // Retry until the frame is presented; the overall timeout still applies.
        if (isTransparent(context, 128)) { setTimeout(capture, 200); return }
        finish(canvas.toDataURL('image/webp', 0.8))
      } catch { finish('') }
    }
    video.onloadedmetadata = () => {
      metadataReady = true
      // Seek a little past the first frame so decoder initialization and a
      // black frame at time zero do not leave the history row blank.
      seekTime = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0
      try { video.currentTime = seekTime } catch { return finish('') }
      capture()
    }
    video.onloadeddata = video.onseeked = capture
    video.onerror = abort
    try {
      if (source instanceof Blob) objectUrl = URL.createObjectURL(source)
      video.src = objectUrl || String(source)
      video.load()
    } catch { finish('') }
  })
}
