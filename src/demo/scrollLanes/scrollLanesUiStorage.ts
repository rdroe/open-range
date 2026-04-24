export const SCROLL_LANES_UI_STORAGE_KEY = 'open-range:scroll-lanes:ui:v1'

export type ScrollLanesParamState = {
  viewableDomainWidth: number
  leftPrefetchFactor: number
  rightPrefetchFactor: number
  aperturePx: number
  tickStep: number
}

export const DEFAULT_SCROLL_LANES_UI: ScrollLanesParamState = {
  viewableDomainWidth: 100,
  leftPrefetchFactor: 1,
  rightPrefetchFactor: 1,
  aperturePx: 720,
  tickStep: 20,
}

type Persisted = {
  v: 1
  params: ScrollLanesParamState
  /** Horizontal scroll in the aperture (px). */
  scrollLeft: number
  /** Integer shifts from `originalRangeValue` along the domain. */
  shiftCount: number
}

const validParam = (k: keyof ScrollLanesParamState, v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

const clampShift = (n: unknown): number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  const t = Math.trunc(n)
  if (t < -10_000 || t > 10_000) return 0
  return t
}

/**
 * @param originalRangeValue Library center baseline (500 in this demo), used to recompute `currentRangeValue` on load.
 */
export function loadScrollLanesUi(
  originalRangeValue: number
):
  | {
      params: ScrollLanesParamState
      scrollLeft: number
      shiftCount: number
      currentRangeValue: number
    }
  | null {
  try {
    const raw = localStorage.getItem(SCROLL_LANES_UI_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || (o as Persisted).v !== 1) return null
    const p = o as Partial<Persisted>
    if (!p.params || typeof p.params !== 'object') return null
    const params = { ...DEFAULT_SCROLL_LANES_UI }
    for (const key of Object.keys(params) as (keyof ScrollLanesParamState)[]) {
      const v = p.params![key]
      if (validParam(key, v)) params[key] = v
    }
    const sl =
      typeof p.scrollLeft === 'number' && Number.isFinite(p.scrollLeft) && p.scrollLeft >= 0
        ? p.scrollLeft
        : 0
    const shiftCount = clampShift(p.shiftCount)
    const currentRangeValue = originalRangeValue + shiftCount * params.viewableDomainWidth
    return { params, scrollLeft: sl, shiftCount, currentRangeValue }
  } catch {
    return null
  }
}

export function saveScrollLanesUi(
  state: ScrollLanesParamState,
  scrollLeft: number,
  shiftCount: number
): void {
  try {
    const payload: Persisted = {
      v: 1,
      params: { ...state },
      scrollLeft,
      shiftCount,
    }
    localStorage.setItem(SCROLL_LANES_UI_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode, quota, etc. */
  }
}

export function clearScrollLanesUiStorage(): void {
  try {
    localStorage.removeItem(SCROLL_LANES_UI_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

