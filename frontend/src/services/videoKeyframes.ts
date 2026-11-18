type Mp4Box = { type: string; start: number; end: number }

function readBoxes(view: DataView, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let size = view.getUint32(offset)
    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7))
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(view.getBigUint64(offset + 8))
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) break
    boxes.push({ type, start: offset + header, end: offset + size })
    offset += size
  }
  return boxes
}

function child(view: DataView, box: Mp4Box | undefined, type: string) {
  return box && readBoxes(view, box.start, box.end).find(item => item.type === type)
}

/**
 * Longest stretch, in seconds, between keyframes of the first video track
 * (including the stretch from the last keyframe to the end). 0 means every
 * frame is a keyframe; null means the file could not be read this way
 * (for example fragmented MP4).
 */
export function longestKeyframeGap(buffer: ArrayBuffer): number | null {
  try {
    const view = new DataView(buffer)
    const moov = readBoxes(view, 0, view.byteLength).find(box => box.type === 'moov')
    if (!moov) return null
    for (const trak of readBoxes(view, moov.start, moov.end).filter(box => box.type === 'trak')) {
      const mdia = child(view, trak, 'mdia')
      const hdlr = child(view, mdia, 'hdlr')
      const mdhd = child(view, mdia, 'mdhd')
      if (!hdlr || !mdhd || hdlr.start + 12 > hdlr.end) continue
      const handler = String.fromCharCode(...[8, 9, 10, 11].map(index => view.getUint8(hdlr.start + index)))
      if (handler !== 'vide') continue
      const timescale = view.getUint32(mdhd.start + (view.getUint8(mdhd.start) === 1 ? 20 : 12))
      const stbl = child(view, child(view, mdia, 'minf'), 'stbl')
      const stts = child(view, stbl, 'stts')
      if (!timescale || !stts) return null
      // Decode time of the start of each sample, plus the track end.
      const starts: number[] = []
      let time = 0
      for (let entry = 0, count = view.getUint32(stts.start + 4); entry < count; entry++) {
        const samples = view.getUint32(stts.start + 8 + entry * 8)
        const delta = view.getUint32(stts.start + 12 + entry * 8)
        for (let sample = 0; sample < samples; sample++, time += delta) starts.push(time)
      }
      const stss = child(view, stbl, 'stss')
      if (!stss) return 0
      const keyTimes: number[] = []
      for (let entry = 0, count = view.getUint32(stss.start + 4); entry < count; entry++) {
        const sampleTime = starts[view.getUint32(stss.start + 8 + entry * 4) - 1]
        if (sampleTime !== undefined) keyTimes.push(sampleTime)
      }
      if (!keyTimes.length) return null
      keyTimes.push(time)
      let longest = 0
      for (let index = 1; index < keyTimes.length; index++) longest = Math.max(longest, keyTimes[index] - keyTimes[index - 1])
      return longest / timescale
    }
    return null
  } catch {
    return null
  }
}

// Seeking decodes from the previous keyframe, so provider videos with one
// keyframe every ~10 s stutter when the progress bar is dragged.
export const MAX_SEEKABLE_KEYFRAME_GAP_SECONDS = 2

/** True when the MP4's keyframes are too far apart for smooth dragging. */
export async function needsSeekableReencode(blob: Blob): Promise<boolean> {
  if (typeof blob.arrayBuffer !== 'function') return false
  const gap = longestKeyframeGap(await blob.arrayBuffer())
  return gap !== null && gap > MAX_SEEKABLE_KEYFRAME_GAP_SECONDS
}
