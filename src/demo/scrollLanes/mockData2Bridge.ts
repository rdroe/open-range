import { getOrCreateBrowserSessionId } from '../../lib/mockData/browserSessionId'
import { createIndexedDbKeyValue } from '../../lib/mockData/indexedDbKeyValue'
import { createMockData2 } from '../../lib/mockData2/create-mock-data2'
import type { MockRangeElement2 } from '../../lib/mockData2/types'
import { RANGE_ID } from './constants'
import { generateElementsForRange } from './generateElements'
import type { LaneElement, LaneId } from './types'

const sessionId = getOrCreateBrowserSessionId()

const laneToMock2 = (el: LaneElement): MockRangeElement2 => ({
  start: el.startX,
  end: el.endX,
  data: {
    id: el.id,
    tag3: el.tag3,
    height: el.height,
    laneId: el.laneId,
  },
})

export const mock2ToLane = (e: MockRangeElement2): LaneElement => {
  const d = e.data
  if (!d) {
    throw new Error('scroll-lanes: mock element missing data (expected id/tag3/height/laneId)')
  }
  return {
    startX: e.start,
    endX: e.end,
    id: String(d.id),
    tag3: String(d.tag3),
    height: Number(d.height),
    laneId: Number(d.laneId) as LaneId,
  }
}

const useIdb = typeof indexedDB !== 'undefined'

/** Bumped on each “wipe & regenerate” so refilled gaps use new PRNG draws (see `cellKeySeed` epoch). */
let scrollLanesDataEpoch = 0

export const bumpScrollLanesDataEpoch = (): void => {
  scrollLanesDataEpoch++
}

/**
 * `mockData2` store: tags partition by demo, range id, and browser session; gaps are filled
 * with {@link generateElementsForRange} and persisted (IndexedDB when available).
 */
export const scrollLanesMockStore = createMockData2({
  persistence: useIdb ? createIndexedDbKeyValue('open-range-mock2-scroll-lanes', 'kv') : undefined,
  persistenceKeyPrefix: 'open-range:mock2:sl:',
  generateElementsForGap: (gap) =>
    generateElementsForRange(gap[0], gap[1], scrollLanesDataEpoch).map(laneToMock2),
})

export const scrollLanesMockTags = {
  demo: 'scroll-lanes',
  range: RANGE_ID,
  session: sessionId,
} as const

/** Simulated network latency before mock gap fill: uniform in [100, 1000] ms. */
export const scrollLanesSyntheticFetchDelayMs = (): number =>
  100 + Math.floor(Math.random() * 901)
