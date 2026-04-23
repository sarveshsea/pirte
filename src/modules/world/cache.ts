type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export class LruCache<T> {
  private map = new Map<string, CacheEntry<T>>()
  private readonly maxEntries: number
  private readonly ttlMs: number

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  get(key: string): T | null {
    const hit = this.map.get(key)
    if (!hit) return null
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key)
      return null
    }
    this.map.delete(key)
    this.map.set(key, hit)
    return hit.value
  }

  set(key: string, value: T) {
    this.map.delete(key)
    this.map.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })

    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (!oldest) break
      this.map.delete(oldest)
    }
  }
}

const DB_NAME = 'pirte-world-cache-v2'
const STORE = 'entries'
const VERSION = 1

type DbRecord = {
  bucket: string
  key: string
  value: unknown
  expiresAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ['bucket', 'key'] })
        store.createIndex('expiresAt', 'expiresAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'))
  })
  return dbPromise
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    run(store).then(resolve, reject)
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'))
  })
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'))
  })
}

export async function readPersistent<T>(bucket: string, key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null

  try {
    return await withStore('readonly', async (store) => {
      const record = await requestToPromise(store.get([bucket, key]) as IDBRequest<DbRecord | undefined>)
      if (!record) return null
      if (record.expiresAt < Date.now()) {
        void writePersistent(bucket, key, null, -1)
        return null
      }
      return record.value as T
    })
  } catch {
    return null
  }
}

export async function writePersistent(bucket: string, key: string, value: unknown, ttlMs: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  try {
    await withStore('readwrite', async (store) => {
      if (ttlMs < 0 || value == null) {
        await requestToPromise(store.delete([bucket, key]))
        return
      }
      const record: DbRecord = {
        bucket,
        key,
        value,
        expiresAt: Date.now() + ttlMs,
      }
      await requestToPromise(store.put(record))
    })
  } catch {
    // best-effort cache only
  }
}
