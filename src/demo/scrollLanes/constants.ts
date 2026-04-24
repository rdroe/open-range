import type { LaneId } from './types'

export const RANGE_ID = 'scrollLanesDemo'

export const LANE_COLORS = [
  'rgba(96,165,250,0.45)',
  'rgba(52,211,153,0.45)',
  'rgba(251,191,36,0.5)',
  'rgba(192,132,252,0.45)',
  'rgba(248,113,113,0.45)',
] as const

export const DOMAIN_GRID_STEP = 0.85
export const DENSE_LANE: LaneId = 2
