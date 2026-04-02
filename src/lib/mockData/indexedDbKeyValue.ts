import type { MockPersistenceAdapter } from './create-mock-data'

/** Minimal async KV store on IndexedDB for mock range persistence (shared across tabs). */
export function createIndexedDbKeyValue(dbName: string, storeName = 'kv'): MockPersistenceAdapter {
  let dbPromise: Promise<IDBDatabase> | null = null

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1)
        req.onerror = () => reject(req.error)
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
        r.onerror = () => reject(r.error)
      })
    },
    async setItem(key: string, value: string) {
      const db = await getDb()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.put(value, key)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    },
    async removeItem(key: string) {
      const db = await getDb()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.delete(key)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    },
  }
}
