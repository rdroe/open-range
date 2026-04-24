import { describe, it, expect, beforeEach } from 'vitest'
import { createMockData2 } from '../src/lib/mockData2/create-mock-data2'
import { tagsKey } from '../src/lib/mockData2/tags'

const tags = { session: 's1', demo: 'd1', lane: 'L0' }

describe('mockData2', () => {
  let api: ReturnType<typeof createMockData2>
  beforeEach(() => {
    api = createMockData2()
  })

  it('is deterministic by tags', () => {
    expect(tagsKey({ b: '2', a: '1' })).toBe(tagsKey({ a: '1', b: '2' }))
  })

  it('first fetch creates one tracked range', async () => {
    const els = await api.fetchRange(tags, { start: 10, end: 20 })
    expect(els.length).toBeGreaterThan(0)
    for (const e of els) {
      expect(e.end).toBeGreaterThan(e.start)
      expect(e.data).toBeNull()
    }
    const s = await api.getSnapshot(tags)
    expect(s.chunks.length).toBe(1)
    expect(s.chunks[0]!.lo).toBe(10)
    expect(s.chunks[0]!.hi).toBe(20)
  })

  it('re-fetching same range returns same elements and does not duplicate state', async () => {
    const a = await api.fetchRange(tags, { start: 0, end: 100 })
    const b = await api.fetchRange(tags, { start: 0, end: 100 })
    expect(b.length).toBe(a.length)
    const s = await api.getSnapshot(tags)
    expect(s.chunks.length).toBe(1)
  })

  it('overlapping fetch 5–15 merges 10–20 into 5–20', async () => {
    await api.fetchRange(tags, { start: 10, end: 20 })
    await api.fetchRange(tags, { start: 5, end: 15 })
    const s = await api.getSnapshot(tags)
    expect(s.chunks.length).toBe(1)
    expect(s.chunks[0]!.lo).toBe(5)
    expect(s.chunks[0]!.hi).toBe(20)
  })

  it('disjoint chunks and bridge fetch conserves one band when not overlapping request', async () => {
    await api.fetchRange(tags, { start: 0, end: 10 })
    await api.fetchRange(tags, { start: 30, end: 40 })
    let s = await api.getSnapshot(tags)
    expect(s.chunks.length).toBe(2)
    await api.fetchRange(tags, { start: 5, end: 35 })
    s = await api.getSnapshot(tags)
    expect(s.chunks.length).toBe(1)
    expect(s.chunks[0]!.lo).toBe(0)
    expect(s.chunks[0]!.hi).toBe(40)
  })

  it('dataPropertyGenerators fills data on new elements; omitted spec gives null', async () => {
    const withData = createMockData2({
      dataPropertyGenerators: [
        ['foo', () => 1],
        ['bar', () => 'x'],
      ],
    })
    const els = await withData.fetchRange(tags, { start: 0, end: 20 })
    expect(els.length).toBeGreaterThan(0)
    for (const e of els) {
      expect(e.data).toEqual({ foo: 1, bar: 'x' })
    }
  })

  it('generateElementsForGap overrides default and ignores dataPropertyGenerators', async () => {
    const custom = createMockData2({
      dataPropertyGenerators: [['ignored', () => 1]],
      generateElementsForGap: (g) => [
        { start: g[0], end: g[1], data: { k: 2 } },
      ],
    })
    const els = await custom.fetchRange(tags, { start: 0, end: 5 })
    expect(els).toEqual([{ start: 0, end: 5, data: { k: 2 } }])
  })

  it('re-fetch preserves data on elements', async () => {
    const withData = createMockData2({
      dataPropertyGenerators: [['k', () => 42]],
    })
    const a = await withData.fetchRange({ t: '1' }, { start: 0, end: 10 })
    const b = await withData.fetchRange({ t: '1' }, { start: 0, end: 10 })
    expect(b).toEqual(a)
  })

  it('clearForTags is isolated from another tag set', async () => {
    await api.fetchRange(tags, { start: 0, end: 10 })
    await api.fetchRange({ other: 'x' }, { start: 0, end: 10 })
    await api.clearForTags(tags)
    const s0 = await api.getSnapshot(tags)
    const s1 = await api.getSnapshot({ other: 'x' })
    expect(s0.chunks.length).toBe(0)
    expect(s1.chunks.length).toBe(1)
  })
})
