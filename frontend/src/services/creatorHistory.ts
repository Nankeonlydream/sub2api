export type CreatorWorkType = 'image' | 'video'
export type CreatorWorkStatus = 'pending' | 'completed' | 'failed'

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
  mergedOutput?: string
  shotPrompts?: string[]
  shotDurations?: number[]
  mergeError?: string
  aspectRatio?: string
  resolution?: string
  completedAt?: number
  generationDurationMs?: number
  referenceCount?: number
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

function cloneItem(item: CreatorHistoryItem): CreatorHistoryItem {
  return {
    ...item,
    outputs: [...item.outputs],
    shotPrompts: item.shotPrompts ? [...item.shotPrompts] : undefined,
    shotDurations: item.shotDurations ? [...item.shotDurations] : undefined,
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

export async function putCreatorHistory(item: CreatorHistoryItem): Promise<void> {
  const storedItem = cloneItem(item)
  memoryItems.set(storedItem.id, storedItem)

  const database = await openDatabase()
  if (!database) return

  try {
    await runWrite(database, (store) => store.put(storedItem))
  } catch {
    switchToMemory()
  }
}

export async function removeCreatorHistory(id: string): Promise<void> {
  memoryItems.delete(id)

  const database = await openDatabase()
  if (!database) return

  try {
    await runWrite(database, (store) => store.delete(id))
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
  } catch {
    switchToMemory()
  }
}

export const creatorHistory = {
  list: listCreatorHistory,
  put: putCreatorHistory,
  remove: removeCreatorHistory,
  clear: clearCreatorHistory,
}

export default creatorHistory
