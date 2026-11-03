import { cachedCreatorImageOutputs, creatorDataUrlToBlob, forgetCreatorImageOutputs, rememberCreatorImageOutputs } from './creatorImageBlobs'

export type CreatorWorkType = 'image' | 'video'
export type CreatorWorkStatus = 'pending' | 'completed' | 'failed'
export type CreatorVideoGenerationMethod = 'text' | 'image' | 'reference'

export interface CreatorVideoShotQueue {
  /** First shot not yet submitted; earlier shots are in requestId or failed. */
  nextIndex: number
  failedIndexes: number[]
  failureReason?: string
  /** Reference images per shot; emptied once a shot is submitted. */
  referenceBlobs: Blob[][]
}

export interface CreatorHistoryItem {
  id: string
  type: CreatorWorkType
  status: CreatorWorkStatus
  prompt: string
  model: string
  provider: string
  groupName: string
  createdAt: number
  updatedAt: number
  outputs: string[]
  /** Original image bytes. Empty output slots are rebuilt when history is read. */
  imageBlobs?: (Blob | undefined)[]
  imagePersistenceError?: string
  /** Browser-persisted video payloads used to rebuild temporary blob URLs after refresh. */
  videoBlobs?: Blob[]
  /** Small locally generated cover; usable without opening/decoding the video. */
  videoThumbnail?: string
  mergedOutput?: string
  mergedVideoBlob?: Blob
  shotPrompts?: string[]
  shotDurations?: number[]
  shotAspectRatios?: string[]
  shotResolutions?: string[]
  shotGenerationMethods?: CreatorVideoGenerationMethod[]
  shotReferenceCounts?: number[]
  /** Image-to-video only: false when the source was cropped to the chosen ratio. */
  shotFollowSourceAspects?: boolean[]
  shotActualOutputSizes?: string[]
  /** Multi-shot video: original shot index of each output; failed shots have no output. */
  shotOutputIndexes?: number[]
  /** Multi-shot video still submitting shots; lets a refreshed page submit the rest. */
  shotQueue?: CreatorVideoShotQueue
  mergeError?: string
  groupId?: number
  apiKeyId?: number
  imageCapability?: 'grok' | 'image2' | 'banner'
  aspectRatio?: string
  resolution?: string
  outputSize?: string
  /** Actual pixel dimensions after client-side normalization, when available. */
  actualOutputSize?: string
  /** Original provider dimensions, before download resizing. */
  upstreamImageSizes?: string[]
  imageSizeMode?: 'auto' | 'ratio' | 'custom'
  quality?: string
  outputFormat?: string
  background?: string
  completedAt?: number
  generationDurationMs?: number
  referenceCount?: number
  videoGenerationMethod?: CreatorVideoGenerationMethod
  outputCount?: number
  requestedDuration?: number
  shotCount?: number
  version?: string
  source?: string
  requestId?: string
  /** Server-side image tasks still owed to this work; they survive a refresh. */
  imageTaskIds?: string[]
  error?: string
}

const DATABASE_NAME = 'sub2api-creator-history'
const DATABASE_VERSION = 1
const STORE_NAME = 'works'
const CREATED_AT_INDEX = 'createdAt'

const memoryItems = new Map<string, CreatorHistoryItem>()
let databasePromise: Promise<IDBDatabase | null> | undefined
let memoryOnly = false
const listeners = new Set<(item: CreatorHistoryItem) => void>()
export const CREATOR_HISTORY_CHANGE_KEY = 'sub2api-creator-history-change'
export type CreatorHistoryChange = { type: 'put' | 'remove'; id: string } | { type: 'clear' }
const externalListeners = new Set<(change: CreatorHistoryChange) => void>()

function receiveExternalChange(event: StorageEvent): void {
  if (event.key !== CREATOR_HISTORY_CHANGE_KEY || !event.newValue) return
  try {
    const change = JSON.parse(event.newValue) as CreatorHistoryChange
    if (!change || (change.type !== 'clear' && !(['put', 'remove'].includes(change.type) && typeof change.id === 'string'))) return
    externalListeners.forEach(listener => listener(change))
  } catch { /* Ignore unrelated or malformed storage notifications. */ }
}

export function subscribeExternalCreatorHistory(listener: (change: CreatorHistoryChange) => void): () => void {
  if (!externalListeners.size && typeof window !== 'undefined') window.addEventListener('storage', receiveExternalChange)
  externalListeners.add(listener)
  return () => {
    externalListeners.delete(listener)
    if (!externalListeners.size && typeof window !== 'undefined') window.removeEventListener('storage', receiveExternalChange)
  }
}

function publishHistoryChange(change: CreatorHistoryChange): void {
  try {
    // Notify only after the IndexedDB transaction commits. Never copy image or
    // video payloads into localStorage or between windows.
    window.localStorage.setItem(CREATOR_HISTORY_CHANGE_KEY, JSON.stringify({ ...change, revision: crypto.randomUUID() }))
  } catch { /* Focus/visibility refresh still works if localStorage is blocked. */ }
}

export function subscribeCreatorHistory(listener: (item: CreatorHistoryItem) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function cloneShotQueue(queue?: CreatorVideoShotQueue): CreatorVideoShotQueue | undefined {
  return queue
    ? { ...queue, failedIndexes: [...queue.failedIndexes], referenceBlobs: queue.referenceBlobs.map(blobs => [...blobs]) }
    : undefined
}

function cloneItem(item: CreatorHistoryItem): CreatorHistoryItem {
  return {
    ...item,
    outputs: [...item.outputs],
    imageBlobs: item.imageBlobs ? [...item.imageBlobs] : undefined,
    upstreamImageSizes: item.upstreamImageSizes ? [...item.upstreamImageSizes] : undefined,
    videoBlobs: item.videoBlobs ? [...item.videoBlobs] : undefined,
    shotPrompts: item.shotPrompts ? [...item.shotPrompts] : undefined,
    shotDurations: item.shotDurations ? [...item.shotDurations] : undefined,
    shotAspectRatios: item.shotAspectRatios ? [...item.shotAspectRatios] : undefined,
    shotResolutions: item.shotResolutions ? [...item.shotResolutions] : undefined,
    shotGenerationMethods: item.shotGenerationMethods ? [...item.shotGenerationMethods] : undefined,
    shotReferenceCounts: item.shotReferenceCounts ? [...item.shotReferenceCounts] : undefined,
    shotFollowSourceAspects: item.shotFollowSourceAspects ? [...item.shotFollowSourceAspects] : undefined,
    shotActualOutputSizes: item.shotActualOutputSizes ? [...item.shotActualOutputSizes] : undefined,
    shotOutputIndexes: item.shotOutputIndexes ? [...item.shotOutputIndexes] : undefined,
    shotQueue: cloneShotQueue(item.shotQueue),
    imageTaskIds: item.imageTaskIds ? [...item.imageTaskIds] : undefined,
  }
}

// Store binary bytes rather than multi-megabyte Base64 strings in IndexedDB.
// Keep URLs only for older works whose original bytes have not been recovered.
function imageStorageItem(item: CreatorHistoryItem): CreatorHistoryItem {
  const stored = cloneItem(item)
  if (stored.type !== 'image') return stored
  stored.imageBlobs = stored.outputs.map((output, index) => {
    if (!output.startsWith('data:image/')) return stored.imageBlobs?.[index]
    try {
      // Reuses the Blob this data URL was read from; decodes Base64 only for new images.
      const blob = creatorDataUrlToBlob(output)
      if (!blob) return stored.imageBlobs?.[index]
      stored.outputs[index] = ''
      return blob
    } catch { return stored.imageBlobs?.[index] }
  })
  return stored
}

async function readableItem(item: CreatorHistoryItem): Promise<CreatorHistoryItem> {
  const readable = cloneItem(item)
  if (readable.type !== 'image' || !readable.imageBlobs?.some(Boolean)) return readable
  const blobs = readable.imageBlobs
  // Every focus refresh lists the whole history. Re-encoding unchanged 4K
  // originals to Base64 each time stalls the page, so reuse this revision.
  const revision = `${readable.updatedAt}:${blobs.map(blob => blob ? `${blob.size}/${blob.type}` : '').join(',')}:${readable.outputs.map(output => output.length).join(',')}`
  const cached = cachedCreatorImageOutputs(readable.id, revision)
  readable.outputs = cached ? [...cached] : await Promise.all(readable.outputs.map((output, index) => {
    const blob = blobs[index]
    if (output || !blob) return output
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }))
  if (!cached) rememberCreatorImageOutputs(readable.id, revision, [...readable.outputs], blobs.map((blob, index) => item.outputs[index] ? undefined : blob) as Blob[])
  // Callers work with self-contained URLs, never expiring blob URLs.
  delete readable.imageBlobs
  return readable
}

// The revision check and the write share one transaction, so a delayed
// recovery cannot overwrite a newer result committed by another window.
async function writeItem(
  database: IDBDatabase,
  item: CreatorHistoryItem,
  expectedUpdatedAt?: number,
): Promise<boolean> {
  const encoded = imageStorageItem(item)
  let applied = false
  await runWrite(database, store => {
    if (expectedUpdatedAt === undefined) {
      store.put(encoded)
      applied = true
      return
    }
    const request = store.get(encoded.id)
    request.onsuccess = () => {
      if (request.result?.updatedAt !== expectedUpdatedAt) return
      store.put(encoded)
      applied = true
    }
  })
  return applied
}

export function sortCreatorHistory(items: CreatorHistoryItem[]): CreatorHistoryItem[] {
  return [...items].sort((left, right) => {
    return right.createdAt - left.createdAt || right.updatedAt - left.updatedAt
  })
}

function getIndexedDB(): IDBFactory | null {
  if (typeof window === 'undefined') return null

  try {
    return window.indexedDB ?? null
  } catch {
    return null
  }
}

function switchToMemory(): void {
  memoryOnly = true
  const currentDatabase = databasePromise
  databasePromise = undefined
  void currentDatabase?.then((database) => database?.close()).catch(() => undefined)
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (memoryOnly) return Promise.resolve(null)
  if (databasePromise) return databasePromise

  const indexedDB = getIndexedDB()
  if (!indexedDB) {
    memoryOnly = true
    return Promise.resolve(null)
  }

  databasePromise = new Promise((resolve) => {
    let settled = false

    const fallBack = () => {
      if (settled) return
      settled = true
      memoryOnly = true
      resolve(null)
    }

    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex(CREATED_AT_INDEX, CREATED_AT_INDEX, { unique: false })
        }
      }

      request.onsuccess = () => {
        if (settled || memoryOnly) {
          request.result.close()
          return
        }

        settled = true
        const database = request.result
        database.onversionchange = () => {
          database.close()
          databasePromise = undefined
        }
        resolve(database)
      }

      request.onerror = fallBack
      request.onblocked = fallBack
    } catch {
      fallBack()
    }
  })

  return databasePromise
}

function listMemoryItems(): CreatorHistoryItem[] {
  return sortCreatorHistory(Array.from(memoryItems.values(), cloneItem))
}

async function listDatabaseItems(database: IDBDatabase): Promise<CreatorHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()
    let items: CreatorHistoryItem[] = []

    request.onsuccess = () => {
      items = request.result.map(cloneItem)
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to read creator history'))
    transaction.oncomplete = () => {
      Promise.all(items.map(readableItem)).then(items => resolve(sortCreatorHistory(items)), reject)
    }
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to read creator history'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Creator history read aborted'))
  })
}

async function runWrite(
  database: IDBDatabase,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    try {
      operation(transaction.objectStore(STORE_NAME))
    } catch (error) {
      transaction.abort()
      reject(error)
      return
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to update creator history'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Creator history update aborted'))
  })
}

export async function listCreatorHistory(): Promise<CreatorHistoryItem[]> {
  const database = await openDatabase()
  if (!database) return listMemoryItems()

  try {
    const databaseItems = await listDatabaseItems(database)
    const mergedItems = new Map(databaseItems.map((item) => [item.id, item]))
    memoryItems.forEach((item, id) => mergedItems.set(id, cloneItem(item)))
    return sortCreatorHistory(Array.from(mergedItems.values()))
  } catch {
    switchToMemory()
    return listMemoryItems()
  }
}

export async function getCreatorHistory(id: string): Promise<CreatorHistoryItem | undefined> {
  const database = await openDatabase()
  if (database) {
    try {
      const stored = await new Promise<CreatorHistoryItem | undefined>((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const pending = memoryItems.get(id)
      // A memory copy exists only for an unsaved write, so it wins a tie: an
      // unsaved metadata patch keeps the revision of the stored work.
      const latest = pending && (!stored || pending.updatedAt >= stored.updatedAt) ? pending : stored
      return latest ? await readableItem(latest) : undefined
    } catch {
      switchToMemory()
    }
  }
  const item = memoryItems.get(id)
  return item ? cloneItem(item) : undefined
}

export async function putCreatorHistory(item: CreatorHistoryItem, expectedUpdatedAt?: number): Promise<boolean | undefined> {
  const storedItem = cloneItem(item)
  // A conditional recovery must not insert a stale memory copy before its
  // revision is checked inside the IndexedDB write transaction.
  if (expectedUpdatedAt === undefined) memoryItems.set(storedItem.id, storedItem)

  const database = await openDatabase()
  let saved = false
  try {
    if (database) {
      const applied = await writeItem(database, storedItem, expectedUpdatedAt)
      if (!applied) return undefined
      saved = true
      // Keep only unsaved items in memory, so stale local copies cannot hide a
      // newer result (or deletion) committed by another creator window.
      if (memoryItems.get(storedItem.id) === storedItem) memoryItems.delete(storedItem.id)
    }
  } catch {
    // Keep the database readable and retry writes after the user frees space.
    // The caller receives false and must explain this session-only fallback.
  }
  if (!saved) {
    if (expectedUpdatedAt !== undefined) {
      const latest = await getCreatorHistory(storedItem.id)
      if (!latest || latest.updatedAt !== expectedUpdatedAt) return undefined
      memoryItems.set(storedItem.id, storedItem)
    }
  }
  const latest = await getCreatorHistory(storedItem.id)
  if (latest) listeners.forEach(listener => listener(cloneItem(latest)))
  if (saved) publishHistoryChange({ type: 'put', id: storedItem.id })
  return saved
}

export async function saveCreatorVideoThumbnail(id: string, updatedAt: number, thumbnail: string): Promise<void> {
  if (!thumbnail.startsWith('data:image/webp;base64,') || thumbnail.length > 100000) return
  const database = await openDatabase()
  const pending = memoryItems.get(id)
  if (pending?.type === 'video' && pending.updatedAt === updatedAt) {
    memoryItems.set(id, { ...pending, videoThumbnail: thumbnail })
  }
  if (!database) return
  try {
    // Patch only an existing matching revision, in one transaction. A late
    // frame extraction must not resurrect a deleted work or overwrite a job.
    await runWrite(database, store => {
      const request = store.get(id)
      request.onsuccess = () => {
        const item = request.result as CreatorHistoryItem | undefined
        if (item?.type === 'video' && item.updatedAt === updatedAt) store.put({ ...item, videoThumbnail: thumbnail })
      }
    })
  } catch { /* Optional covers must not disrupt history or video playback. */ }
}

export async function removeCreatorHistory(id: string): Promise<void> {
  memoryItems.delete(id)
  forgetCreatorImageOutputs(id)

  const database = await openDatabase()
  if (!database) return

  try {
    await runWrite(database, (store) => store.delete(id))
    publishHistoryChange({ type: 'remove', id })
  } catch {
    switchToMemory()
  }
}

export async function clearCreatorHistory(): Promise<void> {
  memoryItems.clear()
  forgetCreatorImageOutputs()

  const database = await openDatabase()
  if (!database) return

  try {
    await runWrite(database, (store) => store.clear())
    publishHistoryChange({ type: 'clear' })
  } catch {
    switchToMemory()
  }
}

export const creatorHistory = {
  subscribe: subscribeCreatorHistory,
  subscribeExternal: subscribeExternalCreatorHistory,
  get: getCreatorHistory,
  list: listCreatorHistory,
  put: putCreatorHistory,
  saveVideoThumbnail: saveCreatorVideoThumbnail,
  remove: removeCreatorHistory,
  clear: clearCreatorHistory,
}

export default creatorHistory
