export const viewablePixels = (aperturePx: number) => aperturePx * 2
export const contentPixels = (viewablePx: number, leftPrefetch: number, rightPrefetch: number) =>
  viewablePx * (leftPrefetch + 1 + rightPrefetch)

export const timelineStart = (
  center: number,
  viewableDomainWidth: number,
  leftPrefetchFactor: number
) => center - viewableDomainWidth / 2 - leftPrefetchFactor * viewableDomainWidth

export const timelineEnd = (
  center: number,
  viewableDomainWidth: number,
  rightPrefetchFactor: number
) => center + viewableDomainWidth / 2 + rightPrefetchFactor * viewableDomainWidth

export const xToPx = (
  x: number,
  t0: number,
  t1: number,
  contentW: number
): number => {
  const s = t1 - t0
  if (s <= 0) return 0
  return ((x - t0) / s) * contentW
}

export const scrollLeftToVisDomain = (
  scrollLeft: number,
  t0: number,
  span: number,
  contentW: number,
  apertureW: number
) => {
  const p0 = (scrollLeft / contentW) * span
  const p1 = ((scrollLeft + apertureW) / contentW) * span
  return { visStart: t0 + p0, visEnd: t0 + p1 }
}

export const defaultInitialScrollLeft = (
  leftPrefetchFactor: number,
  viewablePx: number
) => leftPrefetchFactor * viewablePx + viewablePx / 4

export const zoneName = (
  scrollLeft: number,
  leftPrefetchFactor: number,
  viewablePx: number
): 'nextLeft' | 'viewable' | 'nextRight' => {
  const leftEdge = leftPrefetchFactor * viewablePx
  const rightEdge = leftEdge + viewablePx
  if (scrollLeft < leftEdge) return 'nextLeft'
  if (scrollLeft > rightEdge) return 'nextRight'
  return 'viewable'
}
