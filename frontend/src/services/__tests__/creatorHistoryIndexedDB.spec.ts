// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { reactive } from 'vue'
import type { CreatorHistoryItem } from '../creatorHistory'

function work(id: string, createdAt: number, outputs = ['data:image/png;base64,UE5H']): CreatorHistoryItem {
  return { id, createdAt, updatedAt: createdAt, type: 'image', status: 'completed', outputs,
    prompt: id, model: 'gpt-image-2', provider: 'image2', groupName: 'image' }
}

async function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open('sub2api-creator-history', 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function rawWorks(): Promise<CreatorHistoryItem[]> {
  const db = await openRaw()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('works', 'readonly').objectStore('works').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

describe('Creator image persistence in IndexedDB', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('window', { indexedDB: new IDBFactory(), localStorage: { setItem: vi.fn() } })
    vi.stubGlobal('FileReader', class {
      result = ''
      onload?: () => void
      onerror?: () => void
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(bytes => {
          this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`
          this.onload?.()
        }).catch(() => this.onerror?.())
      }
    })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('stores binary original bytes and recovers them after a fresh module/browser session', async () => {
    const first = await import('../creatorHistory')
    expect(await first.putCreatorHistory(work('original', 1))).toBe(true)
    const raw = (await rawWorks())[0]
    expect(raw.outputs).toEqual([''])
    expect(raw.imageBlobs?.[0]).toBeInstanceOf(Blob)
    expect(await raw.imageBlobs![0]!.text()).toBe('PNG')
    vi.resetModules()
    const reloaded = await import('../creatorHistory')
    expect((await reloaded.getCreatorHistory('original'))?.outputs).toEqual(['data:image/png;base64,UE5H'])
    expect((await reloaded.listCreatorHistory())[0].outputs).toEqual(['data:image/png;base64,UE5H'])
  })

  it('keeps every image from concurrent multi-output writes', async () => {
    const history = await import('../creatorHistory')
    await Promise.all(Array.from({ length: 18 }, (_, index) => history.putCreatorHistory(
      work(`batch-${index}`, index, ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw==']),
    )))
    const raw = await rawWorks()
    expect(raw).toHaveLength(18)
    expect(raw.reduce((sum, item) => sum + item.outputs.length, 0)).toBe(54)
  })

  it('keeps existing originals readable after a failed write and retries once space is available', async () => {
    const history = await import('../creatorHistory')
    await history.putCreatorHistory(work('safe', 1))
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(await history.putCreatorHistory(work('unsaved', 2))).toBe(false)
    expect((await history.getCreatorHistory('safe'))?.outputs[0]).toBe('data:image/png;base64,UE5H')
    expect((await rawWorks()).map(item => item.id)).toEqual(['safe'])
    put.mockRestore()
    expect(await history.putCreatorHistory(work('unsaved', 2))).toBe(true)
    expect((await rawWorks()).map(item => item.id)).toEqual(['safe', 'unsaved'])
  })

  it('keeps all existing history when the updated app first opens', async () => {
    const history = await import('../creatorHistory')
    await history.putCreatorHistory(work('initial', 0))
    const db = await openRaw()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('works', 'readwrite')
      for (let i = 1; i <= 55; i++) transaction.objectStore('works').put(work(`legacy-${i}`, i, [`https://images.test/${i}.png`]))
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    db.close()
    expect(await history.listCreatorHistory()).toHaveLength(56)
    expect(await rawWorks()).toHaveLength(56)
  })
  it('does not recreate a deleted original or overwrite a newer revision during delayed link recovery', async () => {
    const history = await import('../creatorHistory')
    await history.putCreatorHistory(work('deleted', 1, ['https://temporary.test/deleted.png']))
    const removal = history.removeCreatorHistory('deleted')
    const delayedRecovery = history.putCreatorHistory({ ...work('deleted', 1), updatedAt: 2 }, 1)
    await removal
    expect(await delayedRecovery).toBeUndefined()
    expect(await history.getCreatorHistory('deleted')).toBeUndefined()

    await history.putCreatorHistory(work('edited', 1, ['https://temporary.test/edited.png']))
    await history.putCreatorHistory({ ...work('edited', 1, ['data:image/png;base64,TkVX']), updatedAt: 3 })
    expect(await history.putCreatorHistory({ ...work('edited', 1), updatedAt: 2 }, 1)).toBeUndefined()
    expect((await history.getCreatorHistory('edited'))?.outputs).toEqual(['data:image/png;base64,TkVX'])
  })

  it('saves a video work read through the page reactivity proxy', async () => {
    const history = await import('../creatorHistory')
    const video = reactive({
      ...work('video', 1, []),
      type: 'video',
      videoBlobs: [new Blob(['mp4'], { type: 'video/mp4' })],
      shotFollowSourceAspects: [true],
    }) as CreatorHistoryItem
    expect(await history.putCreatorHistory({ ...video, actualOutputSize: '2560x1440' })).toBe(true)
    expect((await rawWorks())[0]).toMatchObject({ actualOutputSize: '2560x1440', shotFollowSourceAspects: [true] })
  })

  it('saves the server image tasks of a work read through the page reactivity proxy', async () => {
    const history = await import('../creatorHistory')
    const pending = reactive({ ...work('pending', 1, []), status: 'pending', imageTaskIds: ['imgtask_1'] }) as CreatorHistoryItem
    expect(await history.putCreatorHistory({ ...pending })).toBe(true)
    expect((await rawWorks())[0].imageTaskIds).toEqual(['imgtask_1'])
  })

  it('returns an unsaved metadata patch that keeps the stored revision', async () => {
    const history = await import('../creatorHistory')
    await history.putCreatorHistory(work('patched', 1))
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    expect(await history.putCreatorHistory({ ...work('patched', 1), actualOutputSize: '1024x1024' })).toBe(false)
    expect((await history.getCreatorHistory('patched'))?.actualOutputSize).toBe('1024x1024')
  })

})
