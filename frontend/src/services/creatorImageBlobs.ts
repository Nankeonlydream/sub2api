// History hands the view self-contained data URLs, but it reads the original
// bytes from IndexedDB as Blobs. Remember which Blob produced each data URL so
// display code can decode the Blob directly (off the main thread) instead of
// parsing a multi-megabyte Base64 string again. Entries are tied to the current
// revision of each work, so memory stays bounded by the history already loaded.
const blobsByOutput = new Map<string, Blob>()
const revisions = new Map<string, { revision: string; outputs: string[] }>()
// One blob URL per original: a fresh URL on every preview forces the browser to
// decode a 4K image again, while a stable one can reuse its decoded pixels.
const objectUrlsByOutput = new Map<string, string>()

export function rememberCreatorImageOutputs(workId: string, revision: string, outputs: string[], blobs: Blob[]): void {
  forgetCreatorImageOutputs(workId, outputs)
  revisions.set(workId, { revision, outputs })
  outputs.forEach((output, index) => {
    const blob = blobs[index]
    if (output && blob) blobsByOutput.set(output, blob)
  })
}

/** Data URLs previously read for this exact work revision, if still valid. */
export function cachedCreatorImageOutputs(workId: string, revision: string): string[] | undefined {
  const cached = revisions.get(workId)
  return cached?.revision === revision ? cached.outputs : undefined
}

/** Outputs listed in keep survive (with their blob URL) because the work still shows them. */
export function forgetCreatorImageOutputs(workId?: string, keep: string[] = []): void {
  if (workId === undefined) {
    revisions.clear()
    blobsByOutput.clear()
    objectUrlsByOutput.forEach(url => URL.revokeObjectURL(url))
    objectUrlsByOutput.clear()
    return
  }
  const kept = new Set(keep)
  revisions.get(workId)?.outputs.forEach(output => {
    if (kept.has(output)) return
    blobsByOutput.delete(output)
    const url = objectUrlsByOutput.get(output)
    if (url) URL.revokeObjectURL(url)
    objectUrlsByOutput.delete(output)
  })
  revisions.delete(workId)
}

export function getCreatorImageBlob(output: string): Blob | undefined {
  return output.startsWith('data:') ? blobsByOutput.get(output) : undefined
}

/** A stable blob URL for a known original data URL; undefined when the Blob is unknown. */
export function getCreatorImageObjectUrl(output: string): string | undefined {
  const existing = objectUrlsByOutput.get(output)
  if (existing) return existing
  const blob = getCreatorImageBlob(output)
  if (!blob || typeof URL.createObjectURL !== 'function') return undefined
  const url = URL.createObjectURL(blob)
  objectUrlsByOutput.set(output, url)
  return url
}

// fetch(dataUrl) would be blocked by the production CSP connect-src.
export function creatorDataUrlToBlob(source: string): Blob | undefined {
  const known = getCreatorImageBlob(source)
  if (known) return known
  const comma = source.indexOf(',')
  if (comma < 0 || comma > 64) return undefined
  const type = /^data:(image\/[^;,]+);base64$/i.exec(source.slice(0, comma))?.[1]
  if (!type) return undefined
  const binary = atob(source.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let offset = 0; offset < binary.length; offset++) bytes[offset] = binary.charCodeAt(offset)
  return new Blob([bytes], { type })
}
