/**
 * Optional payload attached to a mock interval. Manufactured by `createMockData2` when
 * `dataPropertyGenerators` is set; otherwise `null`.
 */
export type MockElementData2 = Record<string, number | string>

/**
 * A half-open or closed interval in domain units; typical mock is closed [start, end] with end > start.
 */
export type MockRangeElement2 = {
  start: number
  end: number
  data: MockElementData2 | null
}

/**
 * For each new element, property names and zero-arg factories that return the value for that key.
 * Omitted in options → `data` is `null` on all elements.
 */
export type MockData2DataPropertySpec = [propertyName: string, generator: () => number | string][]

/**
 * String tags to partition mock state (e.g. session id, demo name, range id, lane).
 * All keys/values are significant for lookup; the canonical key is order-independent.
 */
export type MockData2Tags = Record<string, string>

export type MockPersistenceAdapter2 = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export type CreateMockData2Options = {
  /** Async KV backing; defaults to in-memory. */
  persistence?: MockPersistenceAdapter2
  /** Default: `open-range:mock2:` */
  persistenceKeyPrefix?: string
  /**
   * If set, each **newly generated** element gets `data: Record<name, value>`.
   * For each element, every generator is invoked once. If unset, `data` is `null`.
   * Existing persisted elements are unchanged (their `data` is preserved on merge).
   * Ignored when `generateElementsForGap` is set.
   */
  dataPropertyGenerators?: MockData2DataPropertySpec
  /**
   * Replaces the default PRNG-based gap fill. Return full `MockRangeElement2` (including `data` if needed).
   * When set, `dataPropertyGenerators` is not used.
   */
  generateElementsForGap?: (gap: [number, number], tagKey: string) => MockRangeElement2[]
}

/**
 * A contiguous “tracked” range with generated + persisted elements.
 * Chunks in store state for a given tag are disjoint, sorted, non-touching? — they can be non-touching; touching chunks are merged on fetch.
 */
export type TrackedRangeChunk2 = {
  lo: number
  hi: number
  /** Intervals in domain space; not necessarily all strictly inside [lo, hi] (usually are). */
  elements: MockRangeElement2[]
}

export type MockData2StoreSnapshot = {
  tagKey: string
  chunks: TrackedRangeChunk2[]
}

export type MockData2 = {
  /**
   * Fulfills a simulated “fetch” for the half-open/closed [start, end] in domain space.
   * Merges with tag-matching stored ranges, reusing overlapping portions and generating
   * only the gaps, then unifies/extends tracked chunks.
   */
  fetchRange(
    tags: MockData2Tags,
    range: { start: number; end: number }
  ): Promise<MockRangeElement2[]>
  clearForTags(tags: MockData2Tags): Promise<void>
  clearAll(): Promise<void>
  /** Exposes current tracked chunks (for tests / debugging). */
  getSnapshot(tags: MockData2Tags): Promise<MockData2StoreSnapshot>
}
