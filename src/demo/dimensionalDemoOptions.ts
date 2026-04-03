export type DimensionalDemoOptions = {
  /** `flow`: sits in normal document layout (home page). `fixed`: legacy corner panels. */
  layout?: 'fixed' | 'flow'
  parent?: HTMLElement | null
  /** Numeric center at registration (replaces random init). Alphadex uses `numberToAlphadex`. */
  initialCenterInput?: number
}
