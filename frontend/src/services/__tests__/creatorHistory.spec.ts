import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCreatorHistory,
  CREATOR_HISTORY_CHANGE_KEY,
  getCreatorHistory,
  listCreatorHistory,
  putCreatorHistory,
  removeCreatorHistory,
  sortCreatorHistory,
  saveCreatorVideoThumbnail,
  subscribeCreatorHistory,
  subscribeExternalCreatorHistory,
  type CreatorHistoryItem,
} from '@/services/creatorHistory'

function createItem(
  id: string,
  createdAt: number,
  overrides: Partial<CreatorHistoryItem> = {},
): CreatorHistoryItem {
  return {
    id,
    type: 'image',
    status: 'completed',
    prompt: `prompt-${id}`,
    model: 'grok-image',
    provider: 'grok',
    groupName: 'Grok xAI',
    createdAt,
    updatedAt: createdAt,
    outputs: [`https://example.com/${id}.png`],
    ...overrides,
  }
}

describe('creatorHistory', () => {
  it('receives small cross-window change notifications and detaches listeners', () => {
    const received = vi.fn()
    const unsubscribe = subscribeExternalCreatorHistory(received)
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: '{}' }))
    window.dispatchEvent(new StorageEvent('storage', { key: CREATOR_HISTORY_CHANGE_KEY, newValue: 'invalid' }))
    window.dispatchEvent(new StorageEvent('storage', { key: CREATOR_HISTORY_CHANGE_KEY, newValue: '{"type":"put"}' }))
    expect(received).not.toHaveBeenCalled()
    const change = { type: 'put', id: 'other-window' }
    window.dispatchEvent(new StorageEvent('storage', { key: CREATOR_HISTORY_CHANGE_KEY, newValue: JSON.stringify(change) }))
    expect(received).toHaveBeenCalledWith(change)
    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: CREATOR_HISTORY_CHANGE_KEY, newValue: '{"type":"clear"}' }))
    expect(received).toHaveBeenCalledTimes(1)
  })

  it('reads a single work without exposing mutable stored outputs', async () => {
    await putCreatorHistory(createItem('single-read', 100))
    const item = await getCreatorHistory('single-read')
    item!.outputs.push('mutation')
    expect((await getCreatorHistory('single-read'))?.outputs).toEqual(['https://example.com/single-read.png'])
    expect(await getCreatorHistory('missing')).toBeUndefined()
  })

  it('notifies mounted consumers when a background result is saved and unsubscribes cleanly', async () => {
    const received: CreatorHistoryItem[] = []
    const unsubscribe = subscribeCreatorHistory(item => { received.push(item) })
    await putCreatorHistory(createItem('background', 100))
    expect(received).toHaveLength(1)
    received[0].outputs.push('mutation')
    expect((await listCreatorHistory()).find(item => item.id === 'background')?.outputs).toEqual(['https://example.com/background.png'])
    unsubscribe()
    await putCreatorHistory(createItem('background', 101))
    expect(received).toHaveLength(1)
  })
  beforeEach(async () => {
    await clearCreatorHistory()
  })

  it('sorts works by createdAt in descending order', () => {
    const items = [createItem('old', 10), createItem('new', 30), createItem('middle', 20)]

    expect(sortCreatorHistory(items).map((item) => item.id)).toEqual(['new', 'middle', 'old'])
    expect(items.map((item) => item.id)).toEqual(['old', 'new', 'middle'])
  })

  it('stores and updates works in the memory fallback', async () => {
    await putCreatorHistory(createItem('first', 100))
    await putCreatorHistory(createItem('second', 200, { type: 'video' }))
    await putCreatorHistory(createItem('first', 100, {
      status: 'failed',
      updatedAt: 300,
      outputs: [],
      error: 'request failed',
    }))

    const items = await listCreatorHistory()

    expect(items.map((item) => item.id)).toEqual(['second', 'first'])
    expect(items[1]).toMatchObject({ status: 'failed', error: 'request failed' })
  })

  it('returns detached output arrays', async () => {
    const item = createItem('detached', 100)
    await putCreatorHistory(item)
    item.outputs.push('https://example.com/mutated.png')

    const firstRead = await listCreatorHistory()
    firstRead[0].outputs.push('https://example.com/read-mutation.png')
    const secondRead = await listCreatorHistory()

    expect(secondRead[0].outputs).toEqual(['https://example.com/detached.png'])
  })

  it('retains persisted video blobs in detached arrays', async () => {
    const videoBlob = new Blob(['video'], { type: 'video/mp4' })
    const item = createItem('persisted-video', 100, {
      type: 'video',
      outputs: [],
      videoBlobs: [videoBlob],
    })
    await putCreatorHistory(item)
    item.videoBlobs?.push(new Blob(['mutation'], { type: 'video/mp4' }))

    const firstRead = await listCreatorHistory()
    firstRead[0].videoBlobs?.push(new Blob(['read-mutation'], { type: 'video/mp4' }))
    const secondRead = await listCreatorHistory()

    expect(secondRead[0].videoBlobs).toEqual([videoBlob])
  })

  it('patches only an existing matching video revision when saving a cover', async () => {
    const cover = 'data:image/webp;base64,cover'
    await putCreatorHistory(createItem('video-cover', 100, { type: 'video', videoBlobs: [new Blob(['video'])] }))
    await saveCreatorVideoThumbnail('video-cover', 100, cover)
    expect(await getCreatorHistory('video-cover')).toMatchObject({ videoThumbnail: cover, updatedAt: 100 })
    await putCreatorHistory(createItem('video-cover', 100, { type: 'video', updatedAt: 200 }))
    await saveCreatorVideoThumbnail('video-cover', 100, cover)
    expect((await getCreatorHistory('video-cover'))?.videoThumbnail).toBeUndefined()
    await removeCreatorHistory('video-cover')
    await saveCreatorVideoThumbnail('video-cover', 200, cover)
    expect(await getCreatorHistory('video-cover')).toBeUndefined()
  })

  it('keeps per-shot video parameters in detached arrays', async () => {
    const item = createItem('shot-settings', 100, {
      type: 'video',
      shotAspectRatios: ['9:16', '16:9'],
      shotResolutions: ['720p', '1080p'],
      shotGenerationMethods: ['image', 'reference'],
      shotReferenceCounts: [1, 2],
    })
    await putCreatorHistory(item)

    const firstRead = await listCreatorHistory()
    firstRead[0].shotAspectRatios?.push('1:1')
    firstRead[0].shotReferenceCounts?.fill(0)
    const secondRead = await listCreatorHistory()

    expect(secondRead[0].shotAspectRatios).toEqual(['9:16', '16:9'])
    expect(secondRead[0].shotResolutions).toEqual(['720p', '1080p'])
    expect(secondRead[0].shotGenerationMethods).toEqual(['image', 'reference'])
    expect(secondRead[0].shotReferenceCounts).toEqual([1, 2])
  })

  it('removes one work and clears all works', async () => {
    await putCreatorHistory(createItem('first', 100))
    await putCreatorHistory(createItem('second', 200))

    await removeCreatorHistory('second')
    expect((await listCreatorHistory()).map((item) => item.id)).toEqual(['first'])

    await clearCreatorHistory()
    expect(await listCreatorHistory()).toEqual([])
  })

  it('keeps images below the limit and does not limit videos', async () => {
    const items = Array.from({ length: 12 }, (_, index) => [
      createItem(`image-${index}`, index, { type: 'image' }),
      createItem(`video-${index}`, index, { type: 'video' }),
    ]).flat()

    for (const item of items) await putCreatorHistory(item)
    const stored = await listCreatorHistory()
    const images = stored.filter(item => item.type === 'image')
    const videos = stored.filter(item => item.type === 'video')

    expect(images).toHaveLength(12)
    expect(videos).toHaveLength(12)
    expect(images.map(item => item.id)).toEqual(Array.from({ length: 12 }, (_, index) => `image-${11 - index}`))
    expect(videos.map(item => item.id)).toEqual(Array.from({ length: 12 }, (_, index) => `video-${11 - index}`))
  })
  it('retains the newest 50 individual images across multi-output works and leaves videos alone', async () => {
    await putCreatorHistory(createItem('old-video', 0, { type: 'video' }))
    await putCreatorHistory(createItem('running', 1, { status: 'pending', outputs: ['in-progress'] }))
    for (let index = 0; index < 18; index++) {
      await putCreatorHistory(createItem(`batch-${index}`, index + 10, {
        outputs: Array.from({ length: 3 }, (_, n) => `${index}-${n}`),
      }))
    }
    const stored = await listCreatorHistory()
    const images = stored.filter(item => item.type === 'image' && item.status !== 'pending')
    expect(images.reduce((total, work) => total + work.outputs.length, 0)).toBe(50)
    expect(images.at(-1)).toMatchObject({ id: 'batch-1', outputs: ['1-1', '1-2'], outputCount: 2 })
    expect(stored.some(work => work.id === 'batch-0')).toBe(false)
    expect(stored.some(work => work.id === 'old-video')).toBe(true)
    expect(stored.some(work => work.id === 'running')).toBe(true)
  })

  it('does not make an edited old image newer than a recently generated image', async () => {
    for (let index = 0; index < 50; index++) await putCreatorHistory(createItem(`image-${index}`, index))
    await putCreatorHistory(createItem('image-0', 0, { updatedAt: 10000 }))
    await putCreatorHistory(createItem('image-50', 50))
    expect(await getCreatorHistory('image-0')).toBeUndefined()
    expect((await listCreatorHistory()).filter(work => work.type === 'image')).toHaveLength(50)
  })

})
