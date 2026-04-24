import type { MockData2DataPropertySpec, MockElementData2, MockRangeElement2 } from './types'

const buildData = (spec: MockData2DataPropertySpec | undefined): MockElementData2 | null => {
  if (!spec || spec.length === 0) return null
  const o: Record<string, number | string> = {}
  for (const [name, gen] of spec) {
    o[name] = gen()
  }
  return o as MockElementData2
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function hashGap(g0: number, g1: number): number {
  return hashString(`${g0.toFixed(12)},${g1.toFixed(12)}`)
}

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

/**
 * Produces synthetic sub-intervals inside [g0, g1]. Width/spacing are derived from gap size only
 * (no locked zoom/UPVW; that model was dropped in v2).
 */
export function generateElementsForGap2(
  gap: [number, number],
  tagKey: string,
  rangeSeedSuffix = '',
  dataPropertyGenerators?: MockData2DataPropertySpec
): MockRangeElement2[] {
  const [g0, g1] = gap
  if (g0 >= g1 || !Number.isFinite(g0) || !Number.isFinite(g1)) return []
  const w = g1 - g0
  const baseStep = Math.max(w / 5, Math.abs(w) * Number.EPSILON * 1000)
  const baseHalf = w * 0.22
  const seed = (hashString(tagKey + rangeSeedSuffix) ^ hashGap(g0, g1)) >>> 0
  const rand = mulberry32(seed)

  const dataFor = () => buildData(dataPropertyGenerators)

  const out: MockRangeElement2[] = []
  let phase = rand() * baseStep
  let c = g0 + baseHalf * (0.7 + 0.6 * rand()) + phase

  let guard = 0
  while (guard < 100_000) {
    guard++
    const halfW = baseHalf * (0.55 + 0.9 * rand())
    const jitter = (rand() - 0.5) * baseStep * 0.5
    let center = c + jitter
    center = Math.min(Math.max(center, g0 + halfW), g1 - halfW)
    out.push({ start: center - halfW, end: center + halfW, data: dataFor() })
    const step = baseStep * (0.45 + 1.1 * rand())
    c += step
    if (c > g1 - baseHalf * 0.4) break
  }

  return out
}
