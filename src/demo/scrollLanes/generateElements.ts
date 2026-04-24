import { DENSE_LANE, DOMAIN_GRID_STEP } from './constants'
import type { LaneElement, LaneId } from './types'
import {
  blockHeightForSeed,
  cellKeySeed,
  makeTag3,
  mulberry32,
  widthScale2to5,
} from './prng'

export const groupByLane = (all: LaneElement[]): LaneElement[][] => {
  const by: LaneElement[][] = [[], [], [], [], []]
  for (const e of all) {
    by[e.laneId]!.push(e)
  }
  return by
}

export const generateElementsForRange = (t0: number, t1: number, dataEpoch = 0): LaneElement[] => {
  if (t1 - t0 <= 0 || !Number.isFinite(t0) || !Number.isFinite(t1)) return []
  const gMin = Math.floor(t0 / DOMAIN_GRID_STEP)
  const gMax = Math.ceil(t1 / DOMAIN_GRID_STEP)
  const out: LaneElement[] = []
  for (let g = gMin; g < gMax; g++) {
    const cell0 = g * DOMAIN_GRID_STEP
    const cell1 = (g + 1) * DOMAIN_GRID_STEP
    if (cell1 <= t0 || cell0 >= t1) continue
    for (let lane = 0; lane < 5; lane++) {
      const dense = lane === DENSE_LANE
      const kMax = dense ? 7 : 2
      const skipP = dense ? 0.1 : 0.9
      for (let k = 0; k < kMax; k++) {
        const s0 = cellKeySeed(g, lane, k, dataEpoch)
        const r1 = mulberry32(s0)()
        const r2 = mulberry32(s0 * 0x1f)()
        if (r1 > skipP) continue
        const inner = cell1 - cell0
        if (inner < 0.2) continue
        let w: number
        let s: number
        if (dense) {
          w = 0.07 + r2 * 0.28
          w = Math.min(w, Math.max(0.06, inner * 0.9))
          const u = mulberry32((s0 * 0x1f) >>> 0)()
          const u2 = mulberry32((s0 * 0x3a) >>> 0)()
          s = cell0 + u * Math.max(0, inner * 0.55 - w) * 0.95 + u2 * inner * 0.2
        } else {
          w = 0.15 + r2 * Math.min(inner * 0.75, 9)
          s = cell0 + mulberry32((s0 * 0x1f) >>> 0)() * (inner - w)
        }
        w = Math.min(w * widthScale2to5(s0), inner * 0.98)
        s = Math.min(Math.max(s, cell0), cell1 - w)
        if (s < cell0 || s + w > cell1) continue
        if (s + w <= t0 || s >= t1) continue
        const laneId = lane as LaneId
        const h = blockHeightForSeed(s0) + (dense ? 4 + (k & 1) * 3 : 0)
        out.push({
          id: `c${g}-L${lane}-k${k}`,
          tag3: makeTag3(s0),
          startX: s,
          endX: s + w,
          height: h,
          laneId,
        })
      }
    }
  }
  for (let g = gMin; g < gMax; g++) {
    const cell0 = g * DOMAIN_GRID_STEP
    const cell1 = (g + 1) * DOMAIN_GRID_STEP
    if (cell1 <= t0 || cell0 >= t1) continue
    const inner = cell1 - cell0
    if (inner < 0.3) continue
    const s0 = cellKeySeed(g, DENSE_LANE, 90, dataEpoch)
    if (mulberry32(s0)() > 0.35) continue
    const wRaw = 0.18 + mulberry32(s0 * 2)() * 0.22
    const w = Math.min(wRaw * widthScale2to5(s0 * 0x1e), inner * 0.98)
    const t0b = cell0 + inner * 0.1
    if (t0b + w > cell1 || t0b + w <= t0 || t0b >= t1) continue
    const cSeed = cellKeySeed(g, DENSE_LANE, 91, dataEpoch)
    out.push({
      id: `c${g}-Ld-chord`,
      tag3: makeTag3(cSeed),
      startX: t0b,
      endX: t0b + w,
      height: blockHeightForSeed(s0) + 8,
      laneId: DENSE_LANE,
    })
  }
  return out
}
