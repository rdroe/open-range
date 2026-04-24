import type { MockPersistenceAdapter } from './create-mock-data'

/** Minimal async KV store on IndexedDB for mock range persistence (shared across tabs). */
export function createIndexedDbKeyValue(dbName: string, storeName = 'kv'): MockPersistenceAdapter {
  let dbPromise: Promise<IDBDatabase> | null = null

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1)
        /* v8 ignore start — IDB open failure: hard to force reliably with test fake-idb */
        req.onerror = () => reject(req.error)
        /* v8 ignore stop */
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName)
          }
        }
      })
    }
    return dbPromise
  }

  return {
    async getItem(key: string) {
      const db = await getDb()
      return new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const r = store.get(key)
        r.onsuccess = () => resolve((r.result as string | undefined) ?? null)
        /* v8 ignore start — request error: not exercised in happy-dom fake-idb */
        r.onerror = () => reject(r.error)
        /* v8 ignore stop */
      })
    },
    async setItem(key: string, value: string) {
      const db = await getDb()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.put(value, key)
        r.onsuccess = () => resolve()
        /* v8 ignore start — request error: not exercised in happy-dom fake-idb */
        r.onerror = () => reject(r.error)
        /* v8 ignore stop */
      })
    },
    async removeItem(key: string) {
      const db = await getDb()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.delete(key)
        r.onsuccess = () => resolve()
        /* v8 ignore start — request error: not exercised in happy-dom fake-idb */
        r.onerror = () => reject(r.error)
        /* v8 ignore stop */
      })
    },
  }
}
