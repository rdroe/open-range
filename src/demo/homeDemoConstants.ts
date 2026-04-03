/**
 * Shared numeric center for home demos: mock axis, numeric dimensional, alphadex (`numberToAlphadex`).
 * Non-zero so pan/prefetch behavior is easy to see; round number for stable assertions.
 */
export const HOME_DEMO_DEFAULT_CENTER_INPUT = 4

export const HOME_DEMO_RANGE_IDS = {
  mock: 'mockDataDimensionalDemo',
  numeric: 'dimensionalRangeNumeric',
  alphadex: 'dimensionalRange',
} as const
