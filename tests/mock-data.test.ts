import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockData,
  type MockPersistenceAdapter,
  type RangeParameters,
} from '../src/lib/mockData/create-mock-data'

const baseParams: RangeParameters = {
  zoom: 1,
  unitSize: 0.1,
  unitsPerViewportWidth: 10,
}

/** IndexedDB-backed adapter (uses global `indexedDB` from fake-indexeddb). */
function createIndexedDbPersistence(dbName: string, storeName = 'kv'): MockPersistenceAdapter {
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
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const r = store.get(key)
        r.onsuccess = () => resolve((r.result as string | undefined) ?? null)
        r.onerror = () => reject(r.error)
      })
    },
    async setItem(key: string, value: string) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.put(value, key)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    },
    async removeItem(key: string) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const r = store.delete(key)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    },
  }
}

describe('createMockData (in-memory persistence)', () => {
  it('locks range parameters on first ensureSession and ignores later changes', async () => {
    const api = createMockData()
    await api.ensureSession('s-a', baseParams)
    await api.ensureSession('s-a', { zoom: 99, unitSize: 1, unitsPerViewportWidth: 1 })
    const locked = await api.getLockedParameters('s-a')
    expect(locked).toEqual(baseParams)
  })

  it('keeps separate parameters per session id', async () => {
    const api = createMockData()
    const p1: RangeParameters = { zoom: 1, unitSize: 0.1, unitsPerViewportWidth: 10 }
    const p2: RangeParameters = { zoom: 2, unitSize: 0.2, unitsPerViewportWidth: 8 }
    await api.ensureSession('alpha', p1)
    await api.ensureSession('beta', p2)
    expect(await api.getLockedParameters('alpha')).toEqual(p1)
    expect(await api.getLockedParameters('beta')).toEqual(p2)
  })

  it('returns the same elements when the same range is requested again', async () => {
    const api = createMockData()
    await api.ensureSession('s1', baseParams)
    const a = await api.getElementsForRange('s1', [0, 40])
    const b = await api.getElementsForRange('s1', [0, 40])
    expect(b.map((e) => e.id)).toEqual(a.map((e) => e.id))
    expect(b).toEqual(a)
  })

  it('does not duplicate stored elements when extending the requested range', async () => {
    const api = createMockData()
    await api.ensureSession('s1', baseParams)
    const first = await api.getElementsForRange('s1', [0, 30])
    const second = await api.getElementsForRange('s1', [20, 50])
    const whole = await api.getElementsForRange('s1', [0, 50])
    const idsFromSteps = new Set([...first, ...second].map((e) => e.id))
    expect(idsFromSteps.size).toBe(whole.length)
  })

  it('throws when getElementsForRange is used before ensureSession', async () => {
    const api = createMockData()
    await expect(api.getElementsForRange('unknown', [0, 10])).rejects.toThrow(/unknown session/)
  })
})

describe('createMockData (IndexedDB persistence)', () => {
  let dbName: string

  beforeEach(() => {
    dbName = `open-range-mock-test-${crypto.randomUUID()}`
  })

  it('reloads session state from IndexedDB in a new creator instance', async () => {
    const persistence = createIndexedDbPersistence(dbName)
    const prefix = 'test-prefix:'

    const api1 = createMockData({ persistence, persistenceKeyPrefix: prefix })
    await api1.ensureSession('persisted', baseParams)
    const before = await api1.getElementsForRange('persisted', [0, 35])

    const api2 = createMockData({ persistence, persistenceKeyPrefix: prefix })
    await api2.ensureSession('persisted', {
      zoom: 50,
      unitSize: 999,
      unitsPerViewportWidth: 1,
    })

    const locked = await api2.getLockedParameters('persisted')
    expect(locked).toEqual(baseParams)

    const after = await api2.getElementsForRange('persisted', [0, 35])
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id))
    expect(after).toEqual(before)
  })

  it('clearSession removes data so a new instance has no session', async () => {
    const persistence = createIndexedDbPersistence(dbName)
    const api1 = createMockData({ persistence })
    await api1.ensureSession('gone', baseParams)
    await api1.getElementsForRange('gone', [0, 20])
    await api1.clearSession('gone')

    const api2 = createMockData({ persistence })
    await expect(api2.getElementsForRange('gone', [0, 10])).rejects.toThrow(/unknown session/)
  })

  it('persists materialized gaps so a new instance does not regenerate overlapping coverage', async () => {
    const persistence = createIndexedDbPersistence(dbName)
    const api1 = createMockData({ persistence })
    await api1.ensureSession('gap', baseParams)
    await api1.getElementsForRange('gap', [0, 25])

    const api2 = createMockData({ persistence })
    await api2.ensureSession('gap', baseParams)
    const secondPass = await api2.getElementsForRange('gap', [0, 25])

    const raw = await persistence.getItem(`open-range:mockRange:gap`)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { elements: { id: string }[] }
    expect(parsed.elements.length).toBe(secondPass.length)
  })
})
