/**
 * This is a mock data generator for the range system. It is semi-persistent. indexed db or indexed db mock is used.
 * Given a session id (as can be stored in indexed db), along with range parameters, from which the character of data is determined, create overlapping elements with a start and an end.
 *
 * The session on first request is marked with the initially registered range parameters: zoom, unit size, unitsPerViewportWidth.
 * These are used for the lifetime of the session to determine the character of data, especially density that will be visually reasonable.
 *
 * On-demand, data is created and stored in indexed db. But it stays the same if the same range is requested, or if part of the same range is requested.
 *
 * When a new range is requested in the same session, data is not recreated, but if a never-fetched space is requested, data is created and stored in indexed db.
 *
 * On subsequent requests, the range parameters are not recreated, originals are always used to ensure the same density of data.
 *
 */

export type RangeParameters = {
  zoom: number
  unitSize: number
  unitsPerViewportWidth: number
}

export type MockRangeElement = {
  id: string
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

export type MockDataCreator = {
  /** First call per session locks parameters; later calls ignore new parameters. */
  ensureSession(sessionId: string, rangeParameters: RangeParameters): Promise<void>
  /** Overlapping elements for the requested span; generates only for gaps not yet materialized. */
  getElementsForRange(sessionId: string, range: [number, number]): Promise<MockRangeElement[]>
  getLockedParameters(sessionId: string): Promise<RangeParameters | undefined>
  clearSession(sessionId: string): Promise<void>
}

type SessionState = {
  lockedParams: RangeParameters
  elements: MockRangeElement[]
  /** Merged, disjoint, ascending intervals that already have generated elements. */
  materialized: [number, number][]
  nextElementIndex: number
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

function generateElementsForGap(
  params: RangeParameters,
  gap: [number, number],
  sessionId: string,
  startIndex: number
): { elements: MockRangeElement[]; nextIndex: number } {
  const [g0, g1] = gap
  const vw = viewportWidth(params)
  const step = Math.max(vw / 5, Number.EPSILON * 10)
  const half = vw * 0.22
  const elements: MockRangeElement[] = []
  let idx = startIndex
  let c = g0 + half
  while (c <= g1 - half + 1e-12) {
    const s = c - half
    const e = c + half
    elements.push({
      id: `${sessionId}:el:${idx}`,
      start: s,
      end: e,
    })
    idx++
    c += step
  }
  if (elements.length === 0 && g1 > g0) {
    const mid = (g0 + g1) / 2
    elements.push({
      id: `${sessionId}:el:${idx}`,
      start: mid - half,
      end: mid + half,
    })
    idx++
  }
  return { elements, nextIndex: idx }
}

function overlapsRange(range: [number, number], el: MockRangeElement): boolean {
  return el.start < range[1] && el.end > range[0]
}

function serializeState(state: SessionState): string {
  return JSON.stringify({
    lockedParams: state.lockedParams,
    elements: state.elements,
    materialized: state.materialized,
    nextElementIndex: state.nextElementIndex,
  })
}

function parseState(raw: string): SessionState | null {
  try {
    const o = JSON.parse(raw) as Partial<SessionState>
    if (
      !o.lockedParams ||
      !Array.isArray(o.elements) ||
      !Array.isArray(o.materialized) ||
      typeof o.nextElementIndex !== 'number'
    ) {
      return null
    }
    return o as SessionState
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
  const sessions = new Map<string, SessionState>()
  const inflightHydration = new Map<string, Promise<void>>()

  const storageKey = (sessionId: string) => `${keyPrefix}${sessionId}`

  const persist = async (sessionId: string, state: SessionState) => {
    sessions.set(sessionId, state)
    await persistence.setItem(storageKey(sessionId), serializeState(state))
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
        if (fromDisk) sessions.set(sessionId, fromDisk)
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
        nextElementIndex: 0,
      }
      await persist(sessionId, initial)
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
        const { elements: newEls, nextIndex } = generateElementsForGap(
          state.lockedParams,
          gap,
          sessionId,
          state.nextElementIndex,
        )
        state.elements.push(...newEls)
        state.nextElementIndex = nextIndex
        state.materialized = mergeIntervals([...state.materialized, gap])
      }
      await persist(sessionId, state)
      return state.elements.filter((el) => overlapsRange(range, el))
    },

    async getLockedParameters(sessionId: string) {
      const state = await ensureLoaded(sessionId)
      return state?.lockedParams
    },

    async clearSession(sessionId: string) {
      sessions.delete(sessionId)
      await persistence.removeItem(storageKey(sessionId))
    },
  }
}
