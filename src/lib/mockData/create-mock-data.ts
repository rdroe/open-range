
export type RangeParameters = {
  zoom: number
  unitSize: number
  unitsPerViewportWidth: number
}

/** Interval on the range axis. Layout is stable for a given session + gap, but varies across gaps (seeded randomness). */
export type MockRangeElement = {
  start: number
  end: number
}

/** Async key/value backing (IndexedDB wrapper or in-memory mock). */
export type MockPersistenceAdapter = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export type CreateMockDataOptions = {
  persistence?: MockPersistenceAdapter
  /** Prepended to storage keys per session. Default: `open-range:mockRange:` */
  persistenceKeyPrefix?: string
}

export type MockSessionSummary = {
  lockedParams: RangeParameters
  totalElements: number
  materialized: [number, number][]
}

export type MockDataCreator = {
  /** First call per session locks parameters; later calls ignore new parameters. */
  ensureSession(sessionId: string, rangeParameters: RangeParameters): Promise<void>
  /**
   * Updates `lockedParams` for an existing session without removing stored intervals.
   * Use when the UI’s density (zoom, unit size, etc.) changes but you want to keep materialized mock data.
   */
  updateLockedParameters(sessionId: string, rangeParameters: RangeParameters): Promise<void>
  /**
   * Overlapping elements for the requested span; generates only for gaps not yet materialized.
   * Repeated calls with the same range return the same element objects (reference-stable).
   */
  getElementsForRange(sessionId: string, range: [number, number]): Promise<MockRangeElement[]>
  getLockedParameters(sessionId: string): Promise<RangeParameters | undefined>
  /** Full stored state for summaries / debugging (not filtered by view). */
  getSessionSummary(sessionId: string): Promise<MockSessionSummary | null>
  clearSession(sessionId: string): Promise<void>
  /** Clears every session in memory and on disk for this creator’s key prefix (including the session index). */
  clearAll(): Promise<void>
}

type SessionState = {
  lockedParams: RangeParameters
  elements: MockRangeElement[]
  /** Merged, disjoint, ascending intervals that already have generated elements. */
  materialized: [number, number][]
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i]
    const last = out[out.length - 1]
    if (a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

function gapsInRequest(request: [number, number], covered: [number, number][]): [number, number][] {
  const [r0, r1] = request
  if (r0 >= r1 || !Number.isFinite(r0) || !Number.isFinite(r1)) return []
  const merged = mergeIntervals(covered)
  let cursor = r0
  const gaps: [number, number][] = []
  for (const [c0, c1] of merged) {
    if (c1 <= cursor) continue
    if (c0 >= r1) break
    if (cursor < c0) gaps.push([cursor, Math.min(c0, r1)])
    cursor = Math.max(cursor, c1)
    if (cursor >= r1) break
  }
  if (cursor < r1) gaps.push([cursor, r1])
  return gaps
}

function viewportWidth(params: RangeParameters): number {
  return (params.unitSize * params.unitsPerViewportWidth) / params.zoom
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Stable hash for gap bounds so the same gap always gets the same seed. */
function hashGap(g0: number, g1: number): number {
  return hashString(`${g0.toFixed(12)},${g1.toFixed(12)}`)
}

/** Deterministic PRNG for repeatable, gap-local random layouts. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateElementsForGap(
  params: RangeParameters,
  gap: [number, number],
  sessionId: string
): MockRangeElement[] {
  const [g0, g1] = gap
  const vw = viewportWidth(params)
  const baseStep = Math.max(vw / 5, Number.EPSILON * 10)
  const baseHalf = vw * 0.22
  const seed = (hashString(sessionId) ^ hashGap(g0, g1)) >>> 0
  const rand = mulberry32(seed)

  const elements: MockRangeElement[] = []
  let phase = rand() * baseStep
  let c = g0 + baseHalf * (0.7 + 0.6 * rand()) + phase

  let guard = 0
  while (guard < 100_000) {
    guard++
    const halfW = baseHalf * (0.55 + 0.9 * rand())
    const jitter = (rand() - 0.5) * baseStep * 0.5
    let center = c + jitter
    center = Math.min(Math.max(center, g0 + halfW), g1 - halfW)
    elements.push({ start: center - halfW, end: center + halfW })
    const step = baseStep * (0.45 + 1.1 * rand())
    c += step
    if (c > g1 - baseHalf * 0.4) break
  }

  if (elements.length === 0 && g1 > g0) {
    const r = mulberry32((seed ^ 0x9e3779b9) >>> 0)
    const halfW = baseHalf * (0.55 + 0.9 * r())
    const span = g1 - g0
    const mid = (g0 + g1) / 2 + (r() - 0.5) * span * 0.35
    const center = Math.min(Math.max(mid, g0 + halfW), g1 - halfW)
    elements.push({ start: center - halfW, end: center + halfW })
  }
  return elements
}

function overlapsRange(range: [number, number], el: MockRangeElement): boolean {
  return el.start < range[1] && el.end > range[0]
}

function serializeState(state: SessionState): string {
  return JSON.stringify({
    lockedParams: state.lockedParams,
    elements: state.elements,
    materialized: state.materialized,
  })
}

function parseState(raw: string): SessionState | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (
      !o.lockedParams ||
      typeof o.lockedParams !== 'object' ||
      !Array.isArray(o.elements) ||
      !Array.isArray(o.materialized)
    ) {
      return null
    }
    const elements: MockRangeElement[] = []
    for (const row of o.elements) {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      if (typeof r.start !== 'number' || typeof r.end !== 'number') return null
      elements.push({ start: r.start, end: r.end })
    }
    return {
      lockedParams: o.lockedParams as RangeParameters,
      elements,
      materialized: o.materialized as [number, number][],
    }
  } catch {
    return null
  }
}

function createMemoryPersistence(): MockPersistenceAdapter {
  const m = new Map<string, string>()
  return {
    async getItem(key: string) {
      return m.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      m.set(key, value)
    },
    async removeItem(key: string) {
      m.delete(key)
    },
  }
}

/**
 * Returns a mock data API that tracks many session ids, each with its own locked range parameters
 * and generated elements. Optional persistence mimics IndexedDB-style async storage.
 */
export function createMockData(options?: CreateMockDataOptions): MockDataCreator {
  const persistence = options?.persistence ?? createMemoryPersistence()
  const keyPrefix = options?.persistenceKeyPrefix ?? 'open-range:mockRange:'
  /** Lists session ids that have been persisted so `clearAll` can remove keys without a storage listing API. */
  const sessionIndexKey = `${keyPrefix}__sessions`
  const sessions = new Map<string, SessionState>()
  const inflightHydration = new Map<string, Promise<void>>()

  const storageKey = (sessionId: string) => `${keyPrefix}${sessionId}`

  const readSessionIndex = async (): Promise<string[]> => {
    const raw = await persistence.getItem(sessionIndexKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  const registerSessionInIndex = async (sessionId: string) => {
    const ids = await readSessionIndex()
    if (ids.includes(sessionId)) return
    ids.push(sessionId)
    await persistence.setItem(sessionIndexKey, JSON.stringify(ids))
  }

  const removeSessionFromIndex = async (sessionId: string) => {
    const ids = await readSessionIndex()
    const next = ids.filter((id) => id !== sessionId)
    if (next.length === 0) await persistence.removeItem(sessionIndexKey)
    else await persistence.setItem(sessionIndexKey, JSON.stringify(next))
  }

  const persist = async (sessionId: string, state: SessionState) => {
    sessions.set(sessionId, state)
    await persistence.setItem(storageKey(sessionId), serializeState(state))
    await registerSessionInIndex(sessionId)
  }

  const hydrate = async (sessionId: string): Promise<SessionState | null> => {
    const raw = await persistence.getItem(storageKey(sessionId))
    if (!raw) return null
    return parseState(raw)
  }

  const ensureLoaded = async (sessionId: string): Promise<SessionState | null> => {
    if (sessions.has(sessionId)) return sessions.get(sessionId) ?? null
    let p = inflightHydration.get(sessionId)
    if (!p) {
      p = (async () => {
        const fromDisk = await hydrate(sessionId)
        if (fromDisk) {
          sessions.set(sessionId, fromDisk)
          await registerSessionInIndex(sessionId)
        }
      })()
      inflightHydration.set(sessionId, p)
    }
    await p
    inflightHydration.delete(sessionId)
    return sessions.get(sessionId) ?? null
  }

  return {
    async ensureSession(sessionId: string, rangeParameters: RangeParameters) {
      const existing = await ensureLoaded(sessionId)
      if (existing) return
      const initial: SessionState = {
        lockedParams: { ...rangeParameters },
        elements: [],
        materialized: [],
      }
      await persist(sessionId, initial)
    },

    async updateLockedParameters(sessionId: string, rangeParameters: RangeParameters) {
      const state = await ensureLoaded(sessionId)
      if (!state) {
        throw new Error(
          `Mock data: unknown session "${sessionId}". Call ensureSession first with range parameters.`,
        )
      }
      state.lockedParams = { ...rangeParameters }
      await persist(sessionId, state)
    },

    async getElementsForRange(sessionId: string, range: [number, number]) {
      let state = await ensureLoaded(sessionId)
      if (!state) {
        throw new Error(
          `Mock data: unknown session "${sessionId}". Call ensureSession first with range parameters.`,
        )
      }
      const gaps = gapsInRequest(range, state.materialized)
      for (const gap of gaps) {
        const newEls = generateElementsForGap(state.lockedParams, gap, sessionId)
        state.elements.push(...newEls)
        state.materialized = mergeIntervals([...state.materialized, gap])
      }
      await persist(sessionId, state)
      return state.elements.filter((el) => overlapsRange(range, el))
    },

    async getLockedParameters(sessionId: string) {
      const state = await ensureLoaded(sessionId)
      return state?.lockedParams
    },

    async getSessionSummary(sessionId: string) {
      const state = await ensureLoaded(sessionId)
      if (!state) return null
      return {
        lockedParams: state.lockedParams,
        totalElements: state.elements.length,
        materialized: state.materialized,
      }
    },

    async clearSession(sessionId: string) {
      sessions.delete(sessionId)
      await persistence.removeItem(storageKey(sessionId))
      await removeSessionFromIndex(sessionId)
    },

    async clearAll() {
      const fromIndex = await readSessionIndex()
      const merged = new Set<string>([...fromIndex, ...sessions.keys()])
      for (const id of merged) {
        await persistence.removeItem(storageKey(id))
      }
      await persistence.removeItem(sessionIndexKey)
      sessions.clear()
      inflightHydration.clear()
    },
  }
}
