import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  cachedCreatorImageOutputs,
  creatorDataUrlToBlob,
  forgetCreatorImageOutputs,
  getCreatorImageBlob,
  getCreatorImageObjectUrl,
  rememberCreatorImageOutputs,
} from '../creatorImageBlobs'

describe('creatorImageBlobs', () => {
  afterEach(() => forgetCreatorImageOutputs())

  it('reuses the stored Blob and data URLs only for the same work revision', () => {
    const blob = new Blob(['PNG'], { type: 'image/png' })
    const output = 'data:image/png;base64,UE5H'
    rememberCreatorImageOutputs('work', 'r1', [output], [blob])
    expect(getCreatorImageBlob(output)).toBe(blob)
    expect(creatorDataUrlToBlob(output)).toBe(blob)
    expect(cachedCreatorImageOutputs('work', 'r1')).toEqual([output])
    expect(cachedCreatorImageOutputs('work', 'r2')).toBeUndefined()

    rememberCreatorImageOutputs('work', 'r2', ['data:image/png;base64,TkVX'], [new Blob(['NEW'])])
    expect(getCreatorImageBlob(output)).toBeUndefined()
    forgetCreatorImageOutputs('work')
    expect(cachedCreatorImageOutputs('work', 'r2')).toBeUndefined()
  })

  it('shares one blob URL per original until its work revision changes', () => {
    let next = 0
    const create = vi.fn(() => `blob:original-${next++}`)
    const revoke = vi.fn()
    const { createObjectURL, revokeObjectURL } = URL
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    onTestFinished(() => { Object.assign(URL, { createObjectURL, revokeObjectURL }) })
    const output = 'data:image/png;base64,UE5H'
    rememberCreatorImageOutputs('work', 'r1', [output], [new Blob(['PNG'])])
    expect(getCreatorImageObjectUrl(output)).toBe('blob:original-0')
    expect(getCreatorImageObjectUrl(output)).toBe('blob:original-0')
    expect(create).toHaveBeenCalledOnce()
    // A new revision that still shows the same output keeps its URL.
    rememberCreatorImageOutputs('work', 'r2', [output], [new Blob(['PNG'])])
    expect(revoke).not.toHaveBeenCalled()
    rememberCreatorImageOutputs('work', 'r3', ['data:image/png;base64,TkVX'], [new Blob(['NEW'])])
    expect(revoke).toHaveBeenCalledWith('blob:original-0')
    expect(getCreatorImageObjectUrl(output)).toBeUndefined()
  })

  it('decodes unknown data URLs and ignores non-image sources', () => {
    const blob = creatorDataUrlToBlob('data:image/png;base64,UE5H')
    expect(blob?.type).toBe('image/png')
    expect(blob?.size).toBe(3)
    expect(creatorDataUrlToBlob('/remote.png')).toBeUndefined()
    expect(creatorDataUrlToBlob('data:text/plain;base64,UE5H')).toBeUndefined()
  })
})
