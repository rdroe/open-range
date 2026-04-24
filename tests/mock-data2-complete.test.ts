import { describe, it, expect } from 'vitest'
import {
  createMockData2,
  generateElementsForGap2,
  mergeSortedIntervals,
  gapsInRequest,
  tagsKey,
  normalizeNumberRange,
  type MockPersistenceAdapter2,
} from '../src/lib/mockData2'
import { intervalOverlaps } from '../src/lib/mockData2/intervals'

describe('mockData2 / intervals (library coverage)', () => {
  it('barrel re-exports public API', () => {
    expect(typeof createMockData2).toBe('function')
    expect(typeof generateElementsForGap2).toBe('function')
    expect(typeof mergeSortedIntervals).toBe('function')
    expect(typeof tagsKey).toBe('function')
    expect(typeof normalizeNumberRange).toBe('function')
  })

  it("tagsKey on empty object is the empty-tag sentinel", () => {
    expect(tagsKey({})).toBe('∅')
  })

  it('mergeSortedIntervals: empty, all-invalid, and merge of overlapping', () => {
    expect(mergeSortedIntervals([])).toEqual([])
    expect(
      mergeSortedIntervals([
        [1, 0] as [number, number],
        [NaN, 1] as [number, number],
      ])
    ).toEqual([])
    expect(mergeSortedIntervals([[1, 2], [1, 3]])).toEqual([[1, 3]])
  })

  it('gapsInRequest covers gap scan branches', () => {
    const covered = mergeSortedIntervals([
      [2, 4],
      [7, 9],
    ])
    const gaps0 = gapsInRequest([0, 10], covered)
    expect(gaps0).toEqual([
      [0, 2],
      [4, 7],
      [9, 10],
    ])
  })

  it('generateElementsForGap2 returns [] for invalid or degenerate gap', () => {
    expect(generateElementsForGap2([1, 1], 'k')).toEqual([])
    expect(generateElementsForGap2([10, 5], 'k')).toEqual([])
    expect(generateElementsForGap2([NaN, 1] as [number, number], 'k')).toEqual([])
  })

  it('normalizeNumberRange swaps when end < start', () => {
    expect(normalizeNumberRange(5, 1)).toEqual([1, 5])
    expect(normalizeNumberRange(1, 2)).toEqual([1, 2])
  })

  it('gapsInRequest handles invalid request and early break (c0 >= r1)', () => {
    expect(gapsInRequest([1, 0] as [number, number], [])).toEqual([])
    expect(gapsInRequest([0, Number.NaN] as [number, number], [])).toEqual([])
    expect(gapsInRequest([0, 1] as [number, number], [])).toEqual([[0, 1]])
    expect(
      gapsInRequest([0, 3] as [number, number], [
        [4, 5],
      ])
    ).toEqual([[0, 3]])
  })

  it('intervalOverlaps is symmetric with ordered bounds', () => {
    expect(intervalOverlaps([0, 1], [0.5, 2])).toBe(true)
    expect(intervalOverlaps([2, 3], [0, 1])).toBe(false)
  })
})

describe('createMockData2 (edge cases)', () => {
  it('returns [] when range normalizes to empty (start === end)', async () => {
    const api = createMockData2()
    const els = await api.fetchRange(
      { t: 'x' },
      { start: 2, end: 2 as number }
    )
    expect(els).toEqual([])
  })

  it('clearForTags removes the last key from the index (next.length === 0 in removeFromIndex)', async () => {
    const api = createMockData2()
    await api.fetchRange({ o: 'only' }, { start: 0, end: 1 })
    await api.clearForTags({ o: 'only' })
    expect((await api.getSnapshot({ o: 'only' })).chunks).toEqual([])
  })

  it('clearAll removes all tags from backing store and in-memory', async () => {
    const api = createMockData2()
    await api.fetchRange({ t: 'a' }, { start: 0, end: 2 })
    await api.fetchRange({ t: 'b' }, { start: 0, end: 2 })
    const before = (await api.getSnapshot({ t: 'a' })).chunks.length
    expect(before).toBeGreaterThan(0)
    await api.clearAll()
    expect((await api.getSnapshot({ t: 'a' })).chunks).toEqual([])
    expect((await api.getSnapshot({ t: 'b' })).chunks).toEqual([])
  })

  it('readIndex catch returns [] when index JSON is invalid', async () => {
    const persistence: MockPersistenceAdapter2 = {
      getItem: async (key) => (key.endsWith('__index') ? 'not{json' : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence, persistenceKeyPrefix: 'e2e:' })
    const els = await api.fetchRange({ t: 'x' }, { start: 0, end: 2 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('readIndex returns [] when parse yields non-array', async () => {
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.endsWith('__index') ? '1' : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'x:' })
    const els = await api.fetchRange({ t: 'y' }, { start: 0, end: 1 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('loadState uses empty when persisted tag JSON does not parse (parse returns null)', async () => {
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') ? '{ "chunks": null }' : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'bad:' })
    const els = await api.fetchRange({ t: 'z' }, { start: 0, end: 3 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('synthetic delay skipped when result is 0; callback not called', async () => {
    const api = createMockData2()
    let n = 0
    await api.fetchRange({ s: '1' }, { start: 0, end: 2 }, {
      syntheticDelayMs: () => 0,
      onSyntheticDelayScheduled: () => {
        n++
      },
    })
    expect(n).toBe(0)
  })

  it('synthetic delay also skipped for NaN and non-finite from syntheticDelayMs', async () => {
    const api = createMockData2()
    const t0 = performance.now()
    await api.fetchRange({ t: 'nan' }, { start: 0, end: 1 }, {
      syntheticDelayMs: () => Number.NaN,
    })
    const t1 = performance.now()
    expect(t1 - t0).toBeLessThan(5)
    const t2 = performance.now()
    await api.fetchRange(
      { t: 'inf' },
      { start: 0, end: 1 },
      { syntheticDelayMs: () => Number.POSITIVE_INFINITY }
    )
    expect(performance.now() - t2).toBeLessThan(5)
  })

  it('adjacent fetches merge chunks (consolidate touching) into one range', async () => {
    const api = createMockData2()
    const tag = { session: 'adj' }
    await api.fetchRange(tag, { start: 0, end: 10 })
    await api.fetchRange(tag, { start: 10, end: 20 })
    const s = await api.getSnapshot(tag)
    expect(s.chunks.length).toBe(1)
    expect(s.chunks[0]!.lo).toBe(0)
    expect(s.chunks[0]!.hi).toBe(20)
  })

  it('deduplicates elements with same start+end in one gap (custom gen)', async () => {
    const api = createMockData2({
      generateElementsForGap: () => [
        { start: 0, end: 1, data: { a: 1 } },
        { start: 0, end: 1, data: { a: 2 } },
      ],
    })
    const els = await api.fetchRange({ t: 'd' }, { start: 0, end: 1 })
    expect(els).toEqual([{ start: 0, end: 1, data: { a: 1 } }])
  })

  it('loadState: parse try/catch when stored JSON is invalid for tag state', async () => {
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? '{' : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'try:' })
    const els = await api.fetchRange({ t: 'badjson' }, { start: 0, end: 1 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('loadState: parse returns null for invalid chunk row (lo not a number)', async () => {
    const bad = JSON.stringify({
      chunks: [
        { lo: 'n', hi: 1, elements: [] },
      ],
    })
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? bad : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'pchunk:' })
    const els = await api.fetchRange({ t: 'ch' }, { start: 0, end: 1 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('loadState: ensureElement normalizes element missing data in stored JSON', async () => {
    const raw = JSON.stringify({
      chunks: [
        { lo: 0, hi: 1, elements: [{ start: 0, end: 0.2 }] },
      ],
    })
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? raw : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'nd:' })
    const els = await api.fetchRange({ t: 'nodata' }, { start: 0, end: 0.1 })
    expect(els[0]!.data).toBeNull()
  })

  it('loadState: keep explicit null data without ensureElement coalesce (return same element)', async () => {
    const raw = JSON.stringify({
      chunks: [
        { lo: 0, hi: 1, elements: [{ start: 0, end: 0.2, data: null }] },
      ],
    })
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? raw : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'dnull:' })
    const els = await api.fetchRange({ t: 'dnull' }, { start: 0, end: 0.1 })
    expect(els[0]).toEqual({ start: 0, end: 0.2, data: null })
  })

  it('loadState: parse null when a chunk is null in JSON array', async () => {
    const raw = '{"chunks":[null]}'
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? raw : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'nullc:' })
    const els = await api.fetchRange({ t: 'nc' }, { start: 0, end: 0.1 })
    expect(els.length).toBeGreaterThan(0)
  })

  it('loadState: parse null when elements is not an array', async () => {
    const raw = JSON.stringify({ chunks: [{ lo: 0, hi: 1, elements: 1 }] })
    const p: MockPersistenceAdapter2 = {
      getItem: async (k) => (k.includes('tag:') && !k.includes('__index') ? raw : null),
      setItem: async () => {},
      removeItem: async () => {},
    }
    const api = createMockData2({ persistence: p, persistenceKeyPrefix: 'e1:' })
    const els = await api.fetchRange({ t: 'e1' }, { start: 0, end: 0.1 })
    expect(els.length).toBeGreaterThan(0)
  })
})
