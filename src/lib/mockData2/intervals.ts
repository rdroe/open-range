/**
 * Merged, disjoint, ascending [lo,hi] pairs.
 */
export const mergeSortedIntervals = (intervals: [number, number][]): [number, number][] => {
  if (intervals.length === 0) return []
  const sorted = [...intervals].filter(([a, b]) => a < b && Number.isFinite(a) && Number.isFinite(b))
  if (sorted.length === 0) return []
  sorted.sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i]!
    const last = out[out.length - 1]!
    if (a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * Gaps in `request` not covered by merged `covered` intervals.
 * `covered` should be merged, sorted, disjoint.
 */
export const gapsInRequest = (request: [number, number], covered: [number, number][]): [number, number][] => {
  const [r0, r1] = request
  if (r0 >= r1 || !Number.isFinite(r0) || !Number.isFinite(r1)) return []
  const merged = mergeSortedIntervals(covered)
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

export const intervalOverlaps = (a: [number, number], b: [number, number]): boolean =>
  a[0] < b[1] && a[1] > b[0]

export const normalizeNumberRange = (start: number, end: number): [number, number] =>
  end < start ? [end, start] : [start, end]
