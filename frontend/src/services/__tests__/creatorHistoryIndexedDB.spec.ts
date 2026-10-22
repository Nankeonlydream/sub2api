// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
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

  it('atomically limits concurrent writes to 50 images, including individual outputs in a batch', async () => {
    const history = await import('../creatorHistory')
    await Promise.all(Array.from({ length: 18 }, (_, index) => history.putCreatorHistory(
      work(`batch-${index}`, index, ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==', 'data:image/png;base64,Qw==']),
    )))
    const raw = await rawWorks()
    expect(raw.reduce((sum, item) => sum + item.outputs.length, 0)).toBe(50)
    expect(raw.some(item => item.id === 'batch-0')).toBe(false)
    const oldest = (await history.listCreatorHistory()).at(-1)!
    expect(oldest.id).toBe('batch-1')
    expect(oldest.outputs).toEqual(['data:image/png;base64,Qg==', 'data:image/png;base64,Qw=='])
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

  it('enforces the limit on existing history when the updated app first opens', async () => {
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
    expect(await history.listCreatorHistory()).toHaveLength(50)
    expect(await rawWorks()).toHaveLength(50)
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

})
