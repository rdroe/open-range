import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockData,
  type MockPersistenceAdapter,
  type RangeParameters,
} from '../src/lib/mockData/create-mock-data'
import { generateBrowserSessionName } from '../src/lib/mockData/browserSessionId'

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

  it('updateLockedParameters changes locked params without clearing stored elements', async () => {
    const api = createMockData()
    await api.ensureSession('s-dens', baseParams)
    const els = await api.getElementsForRange('s-dens', [0, 30])
    const newParams: RangeParameters = { zoom: 2, unitSize: 0.2, unitsPerViewportWidth: 8 }
    await api.updateLockedParameters('s-dens', newParams)
    expect(await api.getLockedParameters('s-dens')).toEqual(newParams)
    const again = await api.getElementsForRange('s-dens', [0, 30])
    expect(again).toEqual(els)
  })

  it('updateLockedParameters throws when session is unknown', async () => {
    const api = createMockData()
    await expect(api.updateLockedParameters('nope', baseParams)).rejects.toThrow(/unknown session/)
  })

  it('uses different random layout for different gaps (same width, different position)', async () => {
    const api = createMockData()
    await api.ensureSession('s', baseParams)
    const a = await api.getElementsForRange('s', [0, 8])
    const b = await api.getElementsForRange('s', [1000, 1008])
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(0)
    expect(a[0]).not.toEqual(b[0])
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
    expect(b).toEqual(a)
    if (a.length > 0) expect(b[0]).toBe(a[0])
  })

  it('does not duplicate stored elements when extending the requested range', async () => {
    const api = createMockData()
    await api.ensureSession('s1', baseParams)
    const first = await api.getElementsForRange('s1', [0, 30])
    const second = await api.getElementsForRange('s1', [20, 50])
    const whole = await api.getElementsForRange('s1', [0, 50])
    const keysFromSteps = new Set([...first, ...second].map((e) => `${e.start},${e.end}`))
    expect(keysFromSteps.size).toBe(whole.length)
  })

  it('throws when getElementsForRange is used before ensureSession', async () => {
    const api = createMockData()
    await expect(api.getElementsForRange('unknown', [0, 10])).rejects.toThrow(/unknown session/)
  })

  it('getSessionSummary reflects stored elements and materialized intervals', async () => {
    const api = createMockData()
    const sid = generateBrowserSessionName()
    await api.ensureSession(sid, baseParams)
    await api.getElementsForRange(sid, [0, 25])
    const sum = await api.getSessionSummary(sid)
    expect(sum).not.toBeNull()
    expect(sum!.totalElements).toBeGreaterThan(0)
    expect(sum!.materialized.length).toBeGreaterThan(0)
    expect(sum!.lockedParams).toEqual(baseParams)
  })

  it('clearAll removes every session', async () => {
    const api = createMockData()
    await api.ensureSession('a', baseParams)
    await api.ensureSession('b', baseParams)
    await api.getElementsForRange('a', [0, 10])
    await api.clearAll()
    await expect(api.getElementsForRange('a', [0, 10])).rejects.toThrow(/unknown session/)
    await expect(api.getElementsForRange('b', [0, 10])).rejects.toThrow(/unknown session/)
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
    const parsed = JSON.parse(raw!) as { elements: { start: number; end: number }[] }
    expect(parsed.elements.length).toBe(secondPass.length)
  })

  it('clearAll wipes persisted sessions and index for a new creator instance', async () => {
    const persistence = createIndexedDbPersistence(dbName)
    const prefix = 'open-range:mockRange:'
    const api1 = createMockData({ persistence, persistenceKeyPrefix: prefix })
    await api1.ensureSession('x', baseParams)
    await api1.getElementsForRange('x', [0, 20])
    await api1.clearAll()

    const api2 = createMockData({ persistence, persistenceKeyPrefix: prefix })
    await expect(api2.getElementsForRange('x', [0, 10])).rejects.toThrow(/unknown session/)
    expect(await persistence.getItem(`${prefix}x`)).toBeNull()
    expect(await persistence.getItem(`${prefix}__sessions`)).toBeNull()
  })
})
