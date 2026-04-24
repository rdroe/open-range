import type { LaneElement, LanePackResult, AllLanesLayout } from './types'

const xOverlap1d = (a: { startX: number; endX: number }, b: { startX: number; endX: number }) => {
  return Math.max(a.startX, b.startX) < Math.min(a.endX, b.endX)
}

const packOneLane = (elements: LaneElement[], packStart: number, packEnd: number): LanePackResult => {
  const vis = elements.filter((e) => e.endX > packStart && e.startX < packEnd)
  if (vis.length === 0) {
    return { items: [], laneHeight: 32 }
  }
  const sorted = [...vis].sort(
    (a, b) => a.startX - b.startX || a.endX - b.endX || a.id.localeCompare(b.id)
  )
  const items: { el: LaneElement; top: number }[] = []
  for (const el of sorted) {
    let y = 0
    for (const p of items) {
      if (xOverlap1d(p.el, el)) y = Math.max(y, p.top + p.el.height)
    }
    items.push({ el, top: y })
  }
  const hMax = items.reduce((m, p) => Math.max(m, p.top + p.el.height), 0)
  return { items, laneHeight: Math.max(32, hMax) }
}

export const fixPackByLane = (
  byLane: LaneElement[][],
  packStart: number,
  packEnd: number
): AllLanesLayout => {
  return {
    lanes: [
      packOneLane(byLane[0]!, packStart, packEnd),
      packOneLane(byLane[1]!, packStart, packEnd),
      packOneLane(byLane[2]!, packStart, packEnd),
      packOneLane(byLane[3]!, packStart, packEnd),
      packOneLane(byLane[4]!, packStart, packEnd),
    ],
  } as AllLanesLayout
}
