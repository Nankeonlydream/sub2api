export type CreatorWorkType = 'image' | 'video'
export type CreatorWorkStatus = 'pending' | 'completed' | 'failed'
export type CreatorVideoGenerationMethod = 'text' | 'image' | 'reference'

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
  shotActualOutputSizes?: string[]
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

function cloneItem(item: CreatorHistoryItem): CreatorHistoryItem {
  return {
    ...item,
    outputs: [...item.outputs],
    upstreamImageSizes: item.upstreamImageSizes ? [...item.upstreamImageSizes] : undefined,
    videoBlobs: item.videoBlobs ? [...item.videoBlobs] : undefined,
    shotPrompts: item.shotPrompts ? [...item.shotPrompts] : undefined,
    shotDurations: item.shotDurations ? [...item.shotDurations] : undefined,
    shotAspectRatios: item.shotAspectRatios ? [...item.shotAspectRatios] : undefined,
    shotResolutions: item.shotResolutions ? [...item.shotResolutions] : undefined,
    shotGenerationMethods: item.shotGenerationMethods ? [...item.shotGenerationMethods] : undefined,
    shotReferenceCounts: item.shotReferenceCounts ? [...item.shotReferenceCounts] : undefined,
    shotActualOutputSizes: item.shotActualOutputSizes ? [...item.shotActualOutputSizes] : undefined,
  }
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
    transaction.oncomplete = () => resolve(sortCreatorHistory(items))
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
      const latest = pending && (!stored || pending.updatedAt > stored.updatedAt) ? pending : stored
      return latest ? cloneItem(latest) : undefined
    } catch {
      switchToMemory()
    }
  }
  const item = memoryItems.get(id)
  return item ? cloneItem(item) : undefined
}

export async function putCreatorHistory(item: CreatorHistoryItem): Promise<void> {
  const storedItem = cloneItem(item)
  memoryItems.set(storedItem.id, storedItem)

  const database = await openDatabase()
  let saved = false
  try {
    if (database) {
      await runWrite(database, (store) => store.put(storedItem))
      saved = true
      // Keep only unsaved items in memory, so stale local copies cannot hide a
      // newer result (or deletion) committed by another creator window.
      if (memoryItems.get(storedItem.id) === storedItem) memoryItems.delete(storedItem.id)
    }
  } catch {
    switchToMemory()
  }
  listeners.forEach(listener => listener(cloneItem(storedItem)))
  if (saved) publishHistoryChange({ type: 'put', id: storedItem.id })
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
