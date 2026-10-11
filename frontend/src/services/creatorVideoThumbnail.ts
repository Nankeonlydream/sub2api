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
