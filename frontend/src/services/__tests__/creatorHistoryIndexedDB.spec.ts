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
  it('lists finished image works without encoding their originals until they are read', async () => {
    const first = await import('../creatorHistory')
    await first.putCreatorHistory(work('finished', 2))
    await first.putCreatorHistory({ ...work('running', 3), status: 'pending', imageTaskIds: ['task-1'] })
    await first.putCreatorHistory(work('remote', 1, ['https://images.test/remote.png']))
    vi.resetModules()
    const reloaded = await import('../creatorHistory')
    const readAsDataURL = vi.spyOn(FileReader.prototype, 'readAsDataURL')

    const [running, finished, remote] = await reloaded.listCreatorHistory({ deferImages: true })
    // Pending works stay readable: a refreshed page resumes them in the background.
    expect(running.outputs).toEqual(['data:image/png;base64,UE5H'])
    expect(running.imageOutputsPending).toBeUndefined()
    expect(remote.outputs).toEqual(['https://images.test/remote.png'])
    expect(remote.imageOutputsPending).toBeUndefined()
    expect(finished.imageOutputsPending).toBe(true)
    expect(finished.outputs).toEqual([''])
    expect(readAsDataURL).toHaveBeenCalledTimes(1)

    const loaded = await reloaded.readCreatorHistoryImages(finished)
    expect(loaded.outputs).toEqual(['data:image/png;base64,UE5H'])
    expect(loaded.imageOutputsPending).toBeUndefined()
    expect(loaded.imageBlobs).toBeUndefined()
    // Once read, later lists reuse the encoded images instead of deferring them again.
    const again = await reloaded.listCreatorHistory({ deferImages: true })
    expect(again.find(item => item.id === 'finished')?.outputs).toEqual(['data:image/png;base64,UE5H'])
    expect(readAsDataURL).toHaveBeenCalledTimes(2)
  })

  it('saves a deferred work without losing its stored originals', async () => {
    const first = await import('../creatorHistory')
    await first.putCreatorHistory(work('deferred', 1))
    vi.resetModules()
    const reloaded = await import('../creatorHistory')
    const [deferred] = await reloaded.listCreatorHistory({ deferImages: true })
    expect(deferred.imageOutputsPending).toBe(true)
    await reloaded.putCreatorHistory({ ...deferred, prompt: 'renamed', updatedAt: 2 })
    const raw = (await rawWorks())[0]
    expect(raw.imageOutputsPending).toBeUndefined()
    expect(await raw.imageBlobs![0]!.text()).toBe('PNG')
    expect((await reloaded.getCreatorHistory('deferred'))?.outputs).toEqual(['data:image/png;base64,UE5H'])
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

  it('preserves image request slots and failures across a fresh browser session', async () => {
    const history = await import('../creatorHistory')
    const partial = reactive({
      ...work('image-slots', 1), outputCount: 3,
      imageOutputIndexes: [2], imageFailedIndexes: [1],
      imageTaskIds: ['imgtask_first'], imageTaskIndexes: { imgtask_first: 0 },
    })
    expect(await history.putCreatorHistory({ ...partial })).toBe(true)
    partial.imageOutputIndexes[0] = 0
    partial.imageFailedIndexes.push(2)
    partial.imageTaskIndexes.imgtask_first = 2
    vi.resetModules()
    const reloaded = await import('../creatorHistory')
    expect(await reloaded.getCreatorHistory('image-slots')).toMatchObject({
      outputs: ['data:image/png;base64,UE5H'],
      imageOutputIndexes: [2], imageFailedIndexes: [1], imageTaskIndexes: { imgtask_first: 0 },
    })
  })

  it('saves the billing ids of a work read through the page reactivity proxy', async () => {
    const history = await import('../creatorHistory')
    const done = reactive({ ...work('done', 1, ['data:image/png;base64,iVBORw0KGgo=']), billingIds: ['bill_1'] }) as CreatorHistoryItem
    expect(await history.putCreatorHistory({ ...done })).toBe(true)
    expect((await rawWorks())[0].billingIds).toEqual(['bill_1'])
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

  it('frees the oldest re-downloadable video when storage is full and keeps its record', async () => {
    const history = await import('../creatorHistory')
    const video = (id: string, createdAt: number, extra: Partial<CreatorHistoryItem> = {}) => ({
      ...work(id, createdAt, []), type: 'video', requestId: `req-${id}`,
      videoBlobs: [new Blob(['mp4'], { type: 'video/mp4' })], ...extra,
    }) as CreatorHistoryItem
    await history.putCreatorHistory(video('local-only', 1, { requestId: undefined }))
    await history.putCreatorHistory(video('rendering', 2, { status: 'pending' }))
    await history.putCreatorHistory(video('oldest', 3, { videoThumbnail: 'data:image/webp;base64,AA==' }))
    await history.putCreatorHistory(video('newer', 4, { videoThumbnail: 'data:image/webp;base64,AA==' }))
    const realPut = IDBObjectStore.prototype.put
    let failures = 1
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((value as CreatorHistoryItem).id === 'incoming' && failures-- > 0) throw new DOMException('Full', 'QuotaExceededError')
      return realPut.call(this, value, key)
    })
    expect(await history.putCreatorHistory(video('incoming', 5))).toBe(true)
    expect(history.takeEvictedCreatorVideos()).toEqual(['oldest'])
    const raw = new Map((await rawWorks()).map(item => [item.id, item]))
    expect(raw.get('oldest')).toMatchObject({ videoBlobsEvicted: true, requestId: 'req-oldest', updatedAt: 3 })
    expect(raw.get('oldest')?.videoBlobs).toBeUndefined()
    for (const id of ['local-only', 'rendering', 'newer', 'incoming']) expect(raw.get(id)?.videoBlobs).toHaveLength(1)

    vi.restoreAllMocks()
    expect(await history.putCreatorHistory({ ...video('oldest', 3), updatedAt: 6 })).toBe(true)
    expect((await rawWorks()).find(item => item.id === 'oldest')?.videoBlobsEvicted).toBeUndefined()
  })

  it('reports a full quota when no video can be freed', async () => {
    const history = await import('../creatorHistory')
    await history.putCreatorHistory({ ...work('local-video', 1, []), type: 'video', videoBlobs: [new Blob(['mp4'])] })
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(await history.putCreatorHistory(work('unsaved', 2))).toBe(false)
    expect(history.lastCreatorHistoryWriteError()).toBe('QuotaExceededError')
    expect(history.takeEvictedCreatorVideos()).toEqual([])
    vi.restoreAllMocks()
    expect((await rawWorks())[0].videoBlobs).toHaveLength(1)
  })

})
