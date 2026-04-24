import { generateElementsForGap2 } from './generate-for-gap'
import {
  gapsInRequest,
  intervalOverlaps,
  mergeSortedIntervals,
  normalizeNumberRange,
} from './intervals'
import { tagsKey } from './tags'
import type {
  CreateMockData2Options,
  MockData2,
  MockData2FetchOptions,
  MockData2Tags,
  MockPersistenceAdapter2,
  MockRangeElement2,
  TrackedRangeChunk2,
} from './types'

const runSyntheticDelay = async (opt: MockData2FetchOptions | undefined) => {
  if (!opt?.syntheticDelayMs) return
  const raw = opt.syntheticDelayMs()
  const ms = Math.max(0, Math.floor(Number(raw)))
  if (!Number.isFinite(ms) || ms <= 0) return
  opt.onSyntheticDelayScheduled?.(ms)
  await new Promise<void>((r) => setTimeout(r, ms))
}

function elOverlaps(a: { start: number; end: number }, range: [number, number]): boolean {
  return a.end > range[0] && a.start < range[1]
}

const dedupeElements = (els: MockRangeElement2[]): MockRangeElement2[] => {
  const s = [...els].sort(
    (a, b) => a.start - b.start || a.end - b.end || 0
  )
  const out: MockRangeElement2[] = []
  for (const e of s) {
    const p = out[out.length - 1]
    if (p && p.start === e.start && p.end === e.end) continue
    out.push(e)
  }
  return out
}

const touchEps = (u: number) => 1e-9 * (1 + Math.abs(u))

const consolidateChunks = (chunks: TrackedRangeChunk2[]): TrackedRangeChunk2[] => {
  if (chunks.length === 0) return []
  const s = [...chunks].sort((a, b) => a.lo - b.lo)
  const out: TrackedRangeChunk2[] = []
  for (const c of s) {
    const last = out[out.length - 1]
    if (last && c.lo <= last.hi + touchEps(last.hi)) {
      last.hi = Math.max(last.hi, c.hi)
      last.elements = dedupeElements([...last.elements, ...c.elements])
    } else {
      out.push({ lo: c.lo, hi: c.hi, elements: dedupeElements([...c.elements]) })
    }
  }
  return out
}

const serialize = (c: { chunks: TrackedRangeChunk2[] }) => JSON.stringify(c)
const ensureElement = (e: MockRangeElement2): MockRangeElement2 => {
  if (e.data === undefined) return { ...e, data: null }
  return e
}

const parse = (raw: string): { chunks: TrackedRangeChunk2[] } | null => {
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || !Array.isArray((o as { chunks?: unknown }).chunks)) {
      return null
    }
    const ch = (o as { chunks: TrackedRangeChunk2[] }).chunks
    for (const row of ch) {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof (row as TrackedRangeChunk2).lo !== 'number' ||
        typeof (row as TrackedRangeChunk2).hi !== 'number' ||
        !Array.isArray((row as TrackedRangeChunk2).elements)
      ) {
        return null
      }
    }
    return {
      chunks: ch.map((c) => ({
        ...c,
        elements: c.elements.map((el) => ensureElement(el)),
      })),
    }
  } catch {
    return null
  }
}

function createMemoryPersistence(): MockPersistenceAdapter2 {
  const m = new Map<string, string>()
  return {
    async getItem(k: string) {
      return m.get(k) ?? null
    },
    async setItem(k: string, v: string) {
      m.set(k, v)
    },
    async removeItem(k: string) {
      m.delete(k)
    },
  }
}

type TagState = { chunks: TrackedRangeChunk2[] }

const emptyState = (): TagState => ({ chunks: [] })

export function createMockData2(options?: CreateMockData2Options): MockData2 {
  const persistence = options?.persistence ?? createMemoryPersistence()
  const keyPrefix = options?.persistenceKeyPrefix ?? 'open-range:mock2:'
  const dataPropertyGenerators = options?.dataPropertyGenerators
  const customGen = options?.generateElementsForGap

  const runGap = (g: [number, number], tagKey: string): MockRangeElement2[] => {
    if (customGen) {
      return customGen(g, tagKey)
    }
    return generateElementsForGap2(g, tagKey, '', dataPropertyGenerators)
  }

  const stateKey = (key: string) => `${keyPrefix}tag:${key}`
  const indexKey = `${keyPrefix}__index`

  const readIndex = async (): Promise<string[]> => {
    const raw = await persistence.getItem(indexKey)
    if (!raw) return []
    try {
      const p = JSON.parse(raw) as unknown
      return Array.isArray(p) ? p.filter((k): k is string => typeof k === 'string') : []
    } catch {
      return []
    }
  }

  const register = async (tagKey: string) => {
    const ids = await readIndex()
    if (ids.includes(tagKey)) return
    ids.push(tagKey)
    await persistence.setItem(indexKey, JSON.stringify(ids))
  }

  const removeFromIndex = async (tagKey: string) => {
    const ids = await readIndex()
    const next = ids.filter((k) => k !== tagKey)
    if (next.length === 0) await persistence.removeItem(indexKey)
    else await persistence.setItem(indexKey, JSON.stringify(next))
  }

  const memory = new Map<string, TagState>()
  const inflight = new Map<string, Promise<TagState>>()

  const loadState = async (tagKey: string): Promise<TagState> => {
    if (memory.has(tagKey)) return memory.get(tagKey)!
    let p = inflight.get(tagKey)
    if (!p) {
      p = (async () => {
        const raw = await persistence.getItem(stateKey(tagKey))
        if (!raw) {
          return emptyState()
        }
        const s = parse(raw) ?? emptyState()
        return s
      })()
      inflight.set(tagKey, p)
    }
    const s = await p
    inflight.delete(tagKey)
    memory.set(tagKey, s)
    return s
  }

  const saveState = async (tagKey: string, s: TagState) => {
    memory.set(tagKey, s)
    await persistence.setItem(stateKey(tagKey), serialize(s))
    await register(tagKey)
  }

  const allElementsInRange = (state: TagState, range: [number, number]): MockRangeElement2[] => {
    const [a, b] = range
    const out: MockRangeElement2[] = []
    for (const ch of state.chunks) {
      for (const el of ch.elements) {
        if (elOverlaps(el, [a, b])) out.push(el)
      }
    }
    return dedupeElements(out)
  }

  return {
    async fetchRange(
      tags: MockData2Tags,
      range: { start: number; end: number },
      options?: MockData2FetchOptions
    ) {
      const [a, b] = normalizeNumberRange(range.start, range.end)
      if (a >= b) return []
      const tagKey = tagsKey(tags)
      const state = await loadState(tagKey)
      const req: [number, number] = [a, b]

      const covered = state.chunks.map((c) => [c.lo, c.hi] as [number, number])
      const gapList = gapsInRequest(req, mergeSortedIntervals(covered))
      if (gapList.length > 0) {
        await runSyntheticDelay(options)
      }
      const newElsByGap: MockRangeElement2[][] = gapList.map((g) => runGap(g, tagKey))
      const newEls = newElsByGap.flat()

      const C = state.chunks.filter((c) => intervalOverlaps([c.lo, c.hi], req))
      const taken = new Set(C)
      const rest = state.chunks.filter((c) => !taken.has(c))
      if (C.length > 0) {
        const L = Math.min(a, ...C.map((c) => c.lo))
        const R = Math.max(b, ...C.map((c) => c.hi))
        const fromOld = C.flatMap((c) => c.elements)
        const mergedEls = dedupeElements([...fromOld, ...newEls])
        const merged: TrackedRangeChunk2 = { lo: L, hi: R, elements: mergedEls }
        const next: TrackedRangeChunk2[] = [...rest, merged]
        state.chunks = consolidateChunks(next)
      } else if (gapList.length > 0) {
        const fromGaps: TrackedRangeChunk2[] = gapList.map((g, i) => ({
          lo: g[0]!,
          hi: g[1]!,
          elements: dedupeElements(newElsByGap[i]!),
        }))
        state.chunks = consolidateChunks([...rest, ...fromGaps])
      }

      await saveState(tagKey, state)
      return allElementsInRange(state, req)
    },

    async clearForTags(tags: MockData2Tags) {
      const tagKey = tagsKey(tags)
      memory.delete(tagKey)
      await persistence.removeItem(stateKey(tagKey))
      await removeFromIndex(tagKey)
    },

    async clearAll() {
      const fromIndex = await readIndex()
      const merged = new Set<string>([...fromIndex, ...memory.keys()])
      for (const k of merged) {
        await persistence.removeItem(stateKey(k))
        memory.delete(k)
      }
      await persistence.removeItem(indexKey)
      memory.clear()
    },

    async getSnapshot(tags: MockData2Tags) {
      const tagKey = tagsKey(tags)
      return { tagKey, chunks: (await loadState(tagKey)).chunks } as const
    },
  }
}
