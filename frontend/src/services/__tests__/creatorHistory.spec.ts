import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCreatorHistory,
  listCreatorHistory,
  putCreatorHistory,
  removeCreatorHistory,
  sortCreatorHistory,
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

  it('removes one work and clears all works', async () => {
    await putCreatorHistory(createItem('first', 100))
    await putCreatorHistory(createItem('second', 200))

    await removeCreatorHistory('second')
    expect((await listCreatorHistory()).map((item) => item.id)).toEqual(['first'])

    await clearCreatorHistory()
    expect(await listCreatorHistory()).toEqual([])
  })

  it('keeps all browser-local works without a count limit', async () => {
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
})
