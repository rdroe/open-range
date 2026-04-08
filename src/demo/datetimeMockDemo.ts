/**
 * Dimensional axis in milliseconds with Date ↔ ms converters.
 * Range density uses calendar granularities (seconds … years) for `unitSize`.
 * Mock data uses `generationMode: 'calendarAligned'` (grid-snapped intervals).
 */
import { accessConversionStore, subscribeToRangeInitialization } from '../lib/readableRange'
import type { TicksArray } from '../lib/ticks'
import {
  DimensionalRange,
  registerDimensionalRange,
  subscribeToDimensionalRangeConvertedEndLoading,
  updateDimensionalRange,
  updateDimensionalRangeParams,
} from '../lib/dimensionalRange'
import {
  alignedTickStops,
  registerTicks,
  subscribeToTicksInitialization,
  subscribeToTicksLoadingComplete,
  ticksStore,
} from '../lib/ticks'
import { clearBrowserSessionIdFromStorage, getOrCreateBrowserSessionId } from '../lib/mockData/browserSessionId'
import { createMockData } from '../lib/mockData/create-mock-data'
import { createIndexedDbKeyValue } from '../lib/mockData/indexedDbKeyValue'
import {
  granularityToMilliseconds,
  TIME_GRANULARITIES,
  TIME_GRANULARITY_LABEL,
  type TimeGranularity,
} from '../lib/mockData/granularity'

export const DATETIME_MOCK_DEMO_RANGE_ID = 'datetimeMsMockDemo'

/** Stable default center (UTC) for demos and tests. */
export const DATETIME_MOCK_DEMO_DEFAULT_MS = Date.UTC(2024, 5, 15, 12, 0, 0)

const rangeId = DATETIME_MOCK_DEMO_RANGE_ID

const mockPersistence = createIndexedDbKeyValue('open-range-datetime-mock-demo')
const mock = createMockData({
  persistence: mockPersistence,
  generationMode: 'calendarAligned',
})

let unitGranularity: TimeGranularity = 'hour'

let dimensionalRange: DimensionalRange = {
  zoom: 1,
  unitSize: granularityToMilliseconds(unitGranularity),
  unitsPerViewportWidth: 10,
  leftPrefetchFactor: 2,
  rightPrefetchFactor: 2,
}

let ticksAcrossViewable = 12
const MIN_TICKS_ACROSS = 3
const MAX_TICKS_ACROSS = 120

function normalizePair(pair: [number, number]): [number, number] {
  const [a, b] = pair
  return a <= b ? [a, b] : [b, a]
}

/** Readable ranges may store `Date` or number; normalize to ms for layout + mock. */
function rangeEndpointsToMs(pair: readonly [unknown, unknown]): [number, number] {
  const t0 = pair[0] instanceof Date ? pair[0].getTime() : Number(pair[0])
  const t1 = pair[1] instanceof Date ? pair[1].getTime() : Number(pair[1])
  return normalizePair([t0, t1])
}

function centerInputToMs(input: unknown): number {
  if (input instanceof Date) return input.getTime()
  if (typeof input === 'number') return input
  return DATETIME_MOCK_DEMO_DEFAULT_MS
}

type ZoneBounds = { lo: number; hi: number }

function zoneForMid(
  mid: number,
  left: ZoneBounds,
  center: ZoneBounds,
  right: ZoneBounds
): 'left' | 'center' | 'right' {
  if (mid >= center.lo && mid <= center.hi) return 'center'
  if (mid <= left.hi && mid >= left.lo) return 'left'
  if (mid >= right.lo && mid <= right.hi) return 'right'
  if (mid < center.lo) return 'left'
  return 'right'
}

function barColorsForSpan(length: number): { fill: string; stroke: string } {
  const span = Number.isFinite(length) && length > 0 ? length : Number.EPSILON
  const log = Math.log10(span)
  const hue = ((log * 95 + 40) % 360 + 360) % 360
  const s = 58
  const l = 52
  return {
    fill: `hsla(${hue}, ${s}%, ${l}%, 0.42)`,
    stroke: `hsla(${hue}, ${s}%, ${l - 10}%, 0.88)`,
  }
}

const MOCK_BAR_LANE_COUNT = 4
const MOCK_BAR_LANE_TOP_PX = 22
const MOCK_BAR_LANE_STEP_PX = 13
const MOCK_BAR_HEIGHT_PX = 11

function stableLaneIndexForInterval(start: number, end: number): number {
  const key = `${start.toFixed(12)},${end.toFixed(12)}`
  let h = 2166136261 >>> 0
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0) % MOCK_BAR_LANE_COUNT
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function calendarDayKeyLocal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Single line: calendar year(s) covered by the viewable interval (local). */
function formatAxisHeaderYears(viewLo: number, viewHi: number): string {
  const d0 = new Date(viewLo)
  const d1 = new Date(viewHi)
  const y0 = d0.getFullYear()
  const y1 = d1.getFullYear()
  if (y0 === y1) return String(y0)
  return `${y0} – ${y1}`
}

/**
 * Second line: calendar date(s) without year (year is on the line above).
 * Shown when the view is “small scale” (see {@link shouldShowAxisDateLine}).
 */
function formatAxisHeaderDates(viewLo: number, viewHi: number): string {
  const d0 = new Date(viewLo)
  const d1 = new Date(viewHi)
  if (calendarDayKeyLocal(viewLo) === calendarDayKeyLocal(viewHi)) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(d0)
  }
  const y0 = d0.getFullYear()
  const y1 = d1.getFullYear()
  const sameYear = y0 === y1
  const opt0: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  const opt1: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  const a = new Intl.DateTimeFormat(undefined, opt0).format(d0)
  const b = new Intl.DateTimeFormat(undefined, opt1).format(d1)
  return `${a} – ${b}`
}

/** Show the date subheader when the view is short (≤7d) or zoom is fine (few ms per pixel). */
function shouldShowAxisDateLine(viewWidthMs: number, msPerPixel: number): boolean {
  if (viewWidthMs > 0 && viewWidthMs <= 7 * 86400000) return true
  if (Number.isFinite(msPerPixel) && msPerPixel > 0 && msPerPixel < 40 * 60 * 1000) return true
  return false
}

/**
 * Tick labels: no 4-digit year (year lives in the axis header). Scale from viewable span.
 */
function formatTickLabelForView(tickMs: number, viewLo: number, viewHi: number): string {
  const span = Math.max(viewHi - viewLo, 1)
  const d = new Date(tickMs)
  const yLo = new Date(viewLo).getFullYear()
  const yHi = new Date(viewHi).getFullYear()
  const crossYears = yLo !== yHi

  if (span <= 48 * 3600000) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  }
  if (span <= 21 * 86400000) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
    }).format(d)
  }
  if (span <= 200 * 86400000) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
  }
  if (crossYears) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(d)
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
}

export type MountDatetimeMockDemoOptions = {
  embedded?: boolean
  initialCenterMs?: number
}

export const mountDatetimeMockDemo = (options: MountDatetimeMockDemoOptions = {}) => {
  const { embedded = false, initialCenterMs } = options
  if (typeof document === 'undefined') return

  let sessionId = getOrCreateBrowserSessionId()
  const defaultInitialMs = initialCenterMs ?? DATETIME_MOCK_DEMO_DEFAULT_MS

  const getCurrentCenterMs = (): number => {
    try {
      return centerInputToMs(accessConversionStore(rangeId).input)
    } catch {
      return defaultInitialMs
    }
  }

  const getViewableRangeWidth = (): number => {
    try {
      const rangeStore = accessConversionStore(rangeId)
      const [start, end] = rangeEndpointsToMs(rangeStore.viewableRange as [unknown, unknown])
      return Math.abs(end - start)
    } catch {
      return (
        (dimensionalRange.unitSize * dimensionalRange.unitsPerViewportWidth) /
        dimensionalRange.zoom
      )
    }
  }

  const incrementByViewport = () => {
    const next = getCurrentCenterMs() + getViewableRangeWidth()
    updateDimensionalRange(rangeId, new Date(next))
  }

  const decrementByViewport = () => {
    const next = getCurrentCenterMs() - getViewableRangeWidth()
    updateDimensionalRange(rangeId, new Date(next))
  }

  type RangePair = [number, number]

  const getTickStepFromPolicy = (): number => {
    const w = getViewableRangeWidth()
    if (!Number.isFinite(w) || w <= 0) return 60_000
    return Math.max(w / Math.max(1, ticksAcrossViewable), 60_000)
  }

  const getViewableEndpointsMs = (): RangePair => {
    try {
      return rangeEndpointsToMs(accessConversionStore(rangeId).viewableRange as [unknown, unknown])
    } catch {
      return [0, 1]
    }
  }

  const ticksInRange = (range: RangePair): TicksArray<number> => {
    const [start, end] = range
    const ticks: TicksArray<number> = []
    if (!Number.isFinite(start) || !Number.isFinite(end)) return ticks
    const step = getTickStepFromPolicy()
    if (step <= 0) return ticks
    const [viewLo, viewHi] = getViewableEndpointsMs()
    const labelFor = (v: number) => {
      const rounded = Math.round(v / 1000) * 1000
      return {
        value: rounded,
        label: formatTickLabelForView(rounded, viewLo, viewHi),
      }
    }
    for (const v of alignedTickStops(start, end, step, 0)) {
      ticks.push(labelFor(v))
    }
    return ticks
  }

  const layout = document.createElement('div')
  layout.style.cssText = `
    min-height: ${embedded ? 'auto' : '100vh'};
    box-sizing: border-box;
    background: #0d0d0f;
    color: #e4e4e7;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
  `

  const nav = document.createElement('div')
  nav.style.cssText =
    'flex-shrink: 0; padding: 16px 24px 8px; border-bottom: 1px solid #27272a;'
  const back = document.createElement('a')
  back.href = '/index.html'
  back.textContent = '← All demos (home)'
  back.style.cssText = 'color: #93c5fd; text-decoration: none; font-size: 14px;'
  back.addEventListener('mouseenter', () => {
    back.style.textDecoration = 'underline'
  })
  back.addEventListener('mouseleave', () => {
    back.style.textDecoration = 'none'
  })
  nav.appendChild(back)

  const visualSection = document.createElement('div')
  visualSection.style.cssText = `
    flex: 0 0 auto;
    width: 100%;
    box-sizing: border-box;
    padding: 20px 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
  `

  const visualInner = document.createElement('div')
  visualInner.style.cssText = `
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
  `

  const graphicTitle = document.createElement('div')
  graphicTitle.textContent =
    'Datetime axis (ms): Date ↔ number converters · density by calendar unit · mock data calendarAligned'
  graphicTitle.style.cssText =
    'font-weight: 600; margin-bottom: 12px; font-size: 14px; color: #fafafa; letter-spacing: -0.01em;'

  const tickmarkContainer = document.createElement('div')
  tickmarkContainer.style.cssText = `
    width: 100%;
    background: linear-gradient(180deg, #18181b 0%, #141416 100%);
    border: 1px solid #3f3f46;
    border-radius: 10px;
    padding: 14px 16px 12px;
    box-sizing: border-box;
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  `

  const axisContext = document.createElement('div')
  axisContext.style.cssText = `
    width: 100%;
    margin-bottom: 10px;
    text-align: center;
    padding: 0 4px 2px;
  `
  const axisYearEl = document.createElement('div')
  axisYearEl.setAttribute('data-testid', 'datetime-axis-year')
  axisYearEl.style.cssText = `
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: #fafafa;
    line-height: 1.2;
  `
  const axisDateEl = document.createElement('div')
  axisDateEl.setAttribute('data-testid', 'datetime-axis-dates')
  axisDateEl.style.cssText = `
    margin-top: 5px;
    font-size: 14px;
    font-weight: 500;
    color: #a1a1aa;
    line-height: 1.35;
  `
  axisContext.appendChild(axisYearEl)
  axisContext.appendChild(axisDateEl)

  const tickmarkRuler = document.createElement('div')
  tickmarkRuler.style.cssText = `
    position: relative;
    width: 100%;
    height: 62px;
    border-top: 2px solid #52525b;
    margin-top: 2px;
  `

  const mockStrip = document.createElement('div')
  mockStrip.style.cssText = `
    position: relative;
    width: 100%;
    height: 88px;
    margin-top: 14px;
    background: #0c0c0e;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    overflow: hidden;
  `

  const mockZonesLayer = document.createElement('div')
  mockZonesLayer.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  `
  mockStrip.appendChild(mockZonesLayer)

  const mockLanesLayer = document.createElement('div')
  mockLanesLayer.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  `
  for (let i = 1; i < MOCK_BAR_LANE_COUNT; i++) {
    const sep = document.createElement('div')
    const y = MOCK_BAR_LANE_TOP_PX + i * MOCK_BAR_LANE_STEP_PX - 1
    sep.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      top: ${y}px;
      height: 1px;
      background: rgba(63, 63, 70, 0.55);
    `
    mockLanesLayer.appendChild(sep)
  }
  mockStrip.appendChild(mockLanesLayer)

  const mockStripLabel = document.createElement('div')
  mockStripLabel.textContent =
    'Mock intervals — calendarAligned mode (grid-snapped in ms) · hue by duration'
  mockStripLabel.style.cssText = `
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 11px;
    color: #a1a1aa;
    z-index: 2;
    pointer-events: none;
    font-weight: 500;
  `
  mockStrip.appendChild(mockStripLabel)

  const mockCountLabel = document.createElement('div')
  mockCountLabel.style.cssText = `
    position: absolute;
    bottom: 6px;
    right: 10px;
    font-size: 11px;
    color: #a1a1aa;
    z-index: 2;
    pointer-events: none;
    text-align: right;
    max-width: 70%;
  `
  mockStrip.appendChild(mockCountLabel)

  const mockBarsLayer = document.createElement('div')
  mockBarsLayer.style.cssText = 'position: absolute; inset: 0; z-index: 1; pointer-events: none;'
  mockStrip.appendChild(mockBarsLayer)

  tickmarkContainer.appendChild(axisContext)
  tickmarkContainer.appendChild(tickmarkRuler)
  tickmarkContainer.appendChild(mockStrip)

  visualInner.appendChild(graphicTitle)
  visualInner.appendChild(tickmarkContainer)
  visualSection.appendChild(visualInner)

  const controlsShell = document.createElement('div')
  controlsShell.style.cssText = `
    flex: 1 1 auto;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 24px 32px;
    display: flex;
    justify-content: center;
  `

  const root = document.createElement('div')
  root.id = 'datetime-mock-demo-panel'
  root.style.cssText = `
    width: 100%;
    max-width: 1100px;
    background: #18181b;
    color: #d4d4d8;
    padding: 20px 22px 22px;
    border: 1px solid #3f3f46;
    border-radius: 12px;
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  `

  const btnBase =
    'font: inherit; font-size: 12px; font-weight: 500; padding: 6px 12px; margin: 0 6px 8px 0; border-radius: 6px; cursor: pointer; border: 1px solid; transition: background 0.12s, border-color 0.12s;'

  const makeButton = (label: string, variant: 'primary' | 'muted' | 'danger', onClick: () => void) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = label
    const colors =
      variant === 'primary'
        ? 'background:#27272a;border-color:#52525b;color:#fafafa;'
        : variant === 'danger'
          ? 'background:#3f1212;border-color:#7f1d1d;color:#fecaca;'
          : 'background:#1f1f23;border-color:#3f3f46;color:#d4d4d8;'
    btn.style.cssText = btnBase + colors
    btn.addEventListener('click', onClick)
    btn.addEventListener('mouseenter', () => {
      btn.style.filter = 'brightness(1.08)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.filter = ''
    })
    return btn
  }

  const sectionTitle = (t: string) => {
    const el = document.createElement('div')
    el.textContent = t
    el.style.cssText =
      'font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin: 16px 0 8px;'
    return el
  }

  const kv = (label: string) => {
    const wrap = document.createElement('div')
    wrap.style.cssText =
      'display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; align-items: baseline; margin-bottom: 6px; font-size: 12px;'
    const l = document.createElement('span')
    l.textContent = label
    l.style.cssText = 'color: #a1a1aa;'
    const v = document.createElement('span')
    v.style.cssText = 'color: #fafafa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all;'
    wrap.appendChild(l)
    wrap.appendChild(v)
    return { wrap, valueEl: v }
  }

  const controlsGrid = document.createElement('div')
  controlsGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px 20px;
    align-items: start;
  `

  const colPan = document.createElement('div')
  const colDims = document.createElement('div')
  const colRead = document.createElement('div')

  colPan.appendChild(sectionTitle('Center (Date)'))
  const datetimeInput = document.createElement('input')
  datetimeInput.type = 'datetime-local'
  datetimeInput.style.cssText =
    'width: 100%; max-width: 280px; margin-bottom: 8px; padding: 6px 8px; border-radius: 6px; border: 1px solid #3f3f46; background: #0c0c0e; color: #fafafa; font: inherit;'
  datetimeInput.value = toDatetimeLocalValue(new Date(defaultInitialMs))
  const applyCenterRow = document.createElement('div')
  applyCenterRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;'
  applyCenterRow.appendChild(
    makeButton('Apply center', 'primary', () => {
      const d = new Date(datetimeInput.value)
      if (!Number.isNaN(d.getTime())) {
        updateDimensionalRange(rangeId, d)
      }
    })
  )

  const { wrap: wInput, valueEl: centerReadout } = kv('center (ms)')
  const letterButtonsRow = document.createElement('div')
  letterButtonsRow.style.cssText = 'display: flex; flex-wrap: wrap; margin-bottom: 8px;'
  letterButtonsRow.appendChild(makeButton('← Prev viewport', 'muted', decrementByViewport))
  letterButtonsRow.appendChild(makeButton('Next viewport →', 'muted', incrementByViewport))

  colPan.appendChild(datetimeInput)
  colPan.appendChild(applyCenterRow)
  colPan.appendChild(wInput)
  colPan.appendChild(letterButtonsRow)

  colDims.appendChild(sectionTitle('Density (calendar unit)'))
  const granularityLabel = document.createElement('div')
  granularityLabel.textContent = 'unitSize = one row below (ms); zoom × UPVW set viewport span.'
  granularityLabel.style.cssText = 'font-size: 11px; color: #71717a; margin-bottom: 8px; line-height: 1.4;'

  const granSelect = document.createElement('select')
  granSelect.style.cssText =
    'width: 100%; max-width: 280px; padding: 6px 8px; border-radius: 6px; border: 1px solid #3f3f46; background: #0c0c0e; color: #fafafa; font: inherit; margin-bottom: 10px;'
  for (const g of TIME_GRANULARITIES) {
    const opt = document.createElement('option')
    opt.value = g
    opt.textContent = TIME_GRANULARITY_LABEL[g]
    granSelect.appendChild(opt)
  }
  granSelect.value = unitGranularity

  const { wrap: wZoom, valueEl: zoomValue } = kv('zoom')
  const { wrap: wUnit, valueEl: unitSizeValue } = kv('unitSize (ms)')
  const { wrap: wUpvw, valueEl: upvwValue } = kv('units / viewport')

  const clampZoom = (z: number) => (z < 0.1 ? 0.1 : z)
  const zoomRow = document.createElement('div')
  zoomRow.style.cssText =
    'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; align-items: center;'
  zoomRow.appendChild(
    makeButton('Zoom −1', 'muted', () => {
      dimensionalRange.zoom = clampZoom(dimensionalRange.zoom - 1)
      void applyDensityAndRender()
    })
  )
  zoomRow.appendChild(
    makeButton('Zoom +1', 'muted', () => {
      dimensionalRange.zoom = dimensionalRange.zoom + 1
      void applyDensityAndRender()
    })
  )
  const upvwRow = document.createElement('div')
  upvwRow.style.cssText = 'display: flex; flex-wrap: wrap;'
  upvwRow.appendChild(
    makeButton('UPVW −', 'muted', () => {
      dimensionalRange.unitsPerViewportWidth = dimensionalRange.unitsPerViewportWidth - 1
      if (dimensionalRange.unitsPerViewportWidth <= 1) dimensionalRange.unitsPerViewportWidth = 1
      void applyDensityAndRender()
    })
  )
  upvwRow.appendChild(
    makeButton('UPVW +', 'muted', () => {
      dimensionalRange.unitsPerViewportWidth = dimensionalRange.unitsPerViewportWidth + 1
      void applyDensityAndRender()
    })
  )

  granSelect.addEventListener('change', () => {
    unitGranularity = granSelect.value as TimeGranularity
    dimensionalRange.unitSize = granularityToMilliseconds(unitGranularity)
    void applyDensityAndRender()
  })

  colDims.appendChild(granularityLabel)
  colDims.appendChild(granSelect)
  colDims.appendChild(wZoom)
  colDims.appendChild(zoomRow)
  colDims.appendChild(wUnit)
  colDims.appendChild(wUpvw)
  colDims.appendChild(upvwRow)
  colDims.appendChild(sectionTitle('Tick grid'))
  const { wrap: wTicksAcross, valueEl: ticksAcrossValueEl } = kv('ticks across view')
  const { wrap: wTickStep, valueEl: tickStepValueEl } = kv('tick step (ms)')
  const tickGridRow = document.createElement('div')
  tickGridRow.style.cssText =
    'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; align-items: center;'
  const adjustTicksAcross = (delta: number) => {
    ticksAcrossViewable = Math.min(
      MAX_TICKS_ACROSS,
      Math.max(MIN_TICKS_ACROSS, ticksAcrossViewable + delta)
    )
    void applyDensityAndRender()
  }
  tickGridRow.appendChild(makeButton('−10', 'muted', () => adjustTicksAcross(-10)))
  tickGridRow.appendChild(makeButton('−1', 'muted', () => adjustTicksAcross(-1)))
  tickGridRow.appendChild(makeButton('+1', 'muted', () => adjustTicksAcross(1)))
  tickGridRow.appendChild(makeButton('+10', 'muted', () => adjustTicksAcross(10)))
  colDims.appendChild(wTicksAcross)
  colDims.appendChild(wTickStep)
  colDims.appendChild(tickGridRow)

  colRead.appendChild(sectionTitle('Computed ranges (ms)'))
  const { wrap: wV, valueEl: viewableValue } = kv('viewable')
  const { wrap: wL, valueEl: nextLeftValue } = kv('next left')
  const { wrap: wR, valueEl: nextRightValue } = kv('next right')
  const { wrap: wTicks, valueEl: currentTicksValue } = kv('ticks (view)')
  colRead.appendChild(wV)
  colRead.appendChild(wL)
  colRead.appendChild(wR)
  colRead.appendChild(wTicks)

  controlsGrid.appendChild(colPan)
  controlsGrid.appendChild(colDims)
  controlsGrid.appendChild(colRead)
  root.appendChild(controlsGrid)

  const clearRow = document.createElement('div')
  clearRow.style.cssText = 'margin-top: 8px; padding-top: 12px; border-top: 1px solid #3f3f46;'
  clearRow.appendChild(
    makeButton('Clear all mock data', 'danger', () => {
      void (async () => {
        await mock.clearAll()
        clearBrowserSessionIdFromStorage()
        sessionId = getOrCreateBrowserSessionId()
        await resyncMockSession()
        await render()
      })()
    })
  )
  root.appendChild(clearRow)

  const summaryTitle = document.createElement('div')
  summaryTitle.textContent = 'Session summary'
  summaryTitle.style.cssText =
    'margin-top: 18px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a;'

  const summaryPanel = document.createElement('pre')
  summaryPanel.style.cssText = `
    margin: 8px 0 0;
    padding: 12px 14px;
    background: #0c0c0e;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.5;
    color: #c4c4cc;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 240px;
    overflow-y: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  `
  summaryPanel.textContent = 'Loading…'

  const hint = document.createElement('div')
  hint.textContent =
    'Converters: inputToNumber = Date.getTime(), numberToInput = new Date(ms). Parameters: pick a calendar granularity for unitSize; zoom and UPVW shape the viewport. Mock generator uses calendarAligned mode (see createMockData options).'
  hint.style.cssText = 'margin-top: 14px; color: #71717a; font-size: 12px; line-height: 1.5;'

  root.appendChild(summaryTitle)
  root.appendChild(summaryPanel)
  root.appendChild(hint)
  controlsShell.appendChild(root)

  if (!embedded) {
    layout.appendChild(nav)
  }
  layout.appendChild(visualSection)
  layout.appendChild(controlsShell)

  const mount = document.getElementById('datetime-mock-demo')
  if (mount) mount.appendChild(layout)
  else document.body.appendChild(layout)

  const resyncMockSession = async () => {
    updateDimensionalRangeParams(rangeId, dimensionalRange)
    await mock.clearSession(sessionId)
    await mock.ensureSession(sessionId, {
      zoom: dimensionalRange.zoom,
      unitSize: dimensionalRange.unitSize,
      unitsPerViewportWidth: dimensionalRange.unitsPerViewportWidth,
    })
  }

  const applyDensityAndRender = async () => {
    dimensionalRange.unitSize = granularityToMilliseconds(unitGranularity)
    updateDimensionalRangeParams(rangeId, dimensionalRange)
    await mock.updateLockedParameters(sessionId, {
      zoom: dimensionalRange.zoom,
      unitSize: dimensionalRange.unitSize,
      unitsPerViewportWidth: dimensionalRange.unitsPerViewportWidth,
    })
    await render()
  }

  const renderZoneBackgrounds = (
    zonesLayer: HTMLElement,
    totalStart: number,
    totalWidth: number,
    left: ZoneBounds,
    center: ZoneBounds,
    right: ZoneBounds
  ) => {
    zonesLayer.innerHTML = ''
    const pct = (lo: number, hi: number) => ({
      left: ((lo - totalStart) / totalWidth) * 100,
      w: ((hi - lo) / totalWidth) * 100,
    })
    const zLeft = document.createElement('div')
    const pL = pct(left.lo, left.hi)
    zLeft.style.cssText = `
      position: absolute; left: ${pL.left}%; width: ${Math.max(pL.w, 0)}%; top: 0; bottom: 0;
      background: rgba(96, 165, 250, 0.06);
      border-right: 1px dashed rgba(161, 161, 170, 0.35);
    `
    const zCenter = document.createElement('div')
    const pC = pct(center.lo, center.hi)
    zCenter.style.cssText = `
      position: absolute; left: ${pC.left}%; width: ${Math.max(pC.w, 0)}%; top: 0; bottom: 0;
      background: rgba(244, 244, 245, 0.04);
      border-left: 1px solid rgba(161, 161, 170, 0.2);
      border-right: 1px solid rgba(161, 161, 170, 0.2);
    `
    const zRight = document.createElement('div')
    const pR = pct(right.lo, right.hi)
    zRight.style.cssText = `
      position: absolute; left: ${pR.left}%; width: ${Math.max(pR.w, 0)}%; top: 0; bottom: 0;
      background: rgba(96, 165, 250, 0.06);
      border-left: 1px dashed rgba(161, 161, 170, 0.35);
    `
    zonesLayer.appendChild(zLeft)
    zonesLayer.appendChild(zCenter)
    zonesLayer.appendChild(zRight)
  }

  const renderTickmarks = (totalStart: number, totalWidth: number, centerBounds: ZoneBounds) => {
    tickmarkRuler.innerHTML = ''
    if (!Number.isFinite(totalWidth) || totalWidth <= 0) return

    const ts = ticksStore[rangeId]
    const tickSets: { ticks: TicksArray<number>; opacity: number }[] = [
      { ticks: ts?.ticks.nextLeftRange ?? [], opacity: 0.55 },
      { ticks: ts?.ticks.viewableRange ?? [], opacity: 1 },
      { ticks: ts?.ticks.nextRightRange ?? [], opacity: 0.55 },
    ]

    tickSets.forEach(({ ticks, opacity }) => {
      ticks.forEach(({ value: tick, label: tickStr }) => {
        if (!Number.isFinite(tick)) return
        const position = ((tick - totalStart) / totalWidth) * 100
        if (position < -5 || position > 105) return
        const tickLine = document.createElement('div')
        tickLine.style.cssText = `
          position: absolute;
          left: ${position}%;
          top: 0;
          width: 1px;
          height: 16px;
          background-color: rgba(161, 161, 170, ${0.35 + opacity * 0.45});
          transform: translateX(-50%);
          opacity: ${opacity};
        `
        const tickLabel = document.createElement('div')
        tickLabel.textContent = tickStr
        tickLabel.style.cssText = `
          position: absolute;
          left: ${position}%;
          top: 20px;
          transform: translateX(-50%);
          color: rgba(228, 228, 231, ${0.5 + opacity * 0.5});
          font-size: 11px;
          white-space: nowrap;
          opacity: ${opacity};
        `
        tickmarkRuler.appendChild(tickLine)
        tickmarkRuler.appendChild(tickLabel)
      })
    })

    const inputNum = getCurrentCenterMs()
    const centerPosition = ((inputNum - totalStart) / totalWidth) * 100
    const centerIndicator = document.createElement('div')
    centerIndicator.style.cssText = `
      position: absolute;
      left: ${centerPosition}%;
      top: 0;
      width: 2px;
      height: 32px;
      background: linear-gradient(180deg, #60a5fa, #3b82f6);
      transform: translateX(-50%);
      z-index: 10;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
    `
    tickmarkRuler.appendChild(centerIndicator)

    const viewableBand = document.createElement('div')
    const p0 = ((centerBounds.lo - totalStart) / totalWidth) * 100
    const pw = ((centerBounds.hi - centerBounds.lo) / totalWidth) * 100
    viewableBand.style.cssText = `
      position: absolute;
      bottom: 0;
      left: ${p0}%;
      width: ${Math.max(pw, 0)}%;
      height: 3px;
      background: rgba(96, 165, 250, 0.5);
      border-radius: 2px 2px 0 0;
      pointer-events: none;
    `
    tickmarkRuler.appendChild(viewableBand)
  }

  const renderMockBars = (
    rangeStart: number,
    rangeWidth: number,
    elements: { start: number; end: number }[],
    leftZ: ZoneBounds,
    centerZ: ZoneBounds,
    rightZ: ZoneBounds
  ) => {
    mockBarsLayer.innerHTML = ''
    if (!Number.isFinite(rangeWidth) || rangeWidth <= 0) return

    let nL = 0
    let nC = 0
    let nR = 0

    for (const el of elements) {
      const mid = (el.start + el.end) / 2
      const z = zoneForMid(mid, leftZ, centerZ, rightZ)
      const fade = z === 'center' ? 1 : 0.38
      if (z === 'left') nL++
      else if (z === 'center') nC++
      else nR++

      const span = el.end - el.start
      const { fill, stroke } = barColorsForSpan(span)
      const left = ((el.start - rangeStart) / rangeWidth) * 100
      const w = ((el.end - el.start) / rangeWidth) * 100
      const bar = document.createElement('div')
      const lane = stableLaneIndexForInterval(el.start, el.end)
      const y = MOCK_BAR_LANE_TOP_PX + lane * MOCK_BAR_LANE_STEP_PX
      bar.style.cssText = `
        position: absolute;
        left: ${left}%;
        width: ${Math.max(w, 0.12)}%;
        top: ${y}px;
        height: ${MOCK_BAR_HEIGHT_PX}px;
        box-sizing: border-box;
        background: ${fill};
        border: 1px solid ${stroke};
        border-radius: 3px;
        opacity: ${fade};
      `
      mockBarsLayer.appendChild(bar)
    }

    const cx = ((getCurrentCenterMs() - rangeStart) / rangeWidth) * 100
    const caret = document.createElement('div')
    caret.style.cssText = `
      position: absolute;
      left: ${cx}%;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, #93c5fd, #3b82f6);
      transform: translateX(-50%);
      z-index: 5;
      opacity: 0.95;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.45);
    `
    mockBarsLayer.appendChild(caret)
    mockCountLabel.textContent = `in view: ${elements.length} total · ${nL} left · ${nC} viewable · ${nR} right`
  }

  const formatTicksLine = (ticks: TicksArray<number>): string => {
    return ticks.map((t) => t.label).join(', ')
  }

  const updateAxisContext = (viewLo: number, viewHi: number) => {
    const vw = viewHi - viewLo
    if (!Number.isFinite(vw) || vw <= 0) {
      axisYearEl.textContent = ''
      axisDateEl.textContent = ''
      axisDateEl.style.display = 'none'
      return
    }
    axisYearEl.textContent = formatAxisHeaderYears(viewLo, viewHi)
    const rulerW = tickmarkRuler.offsetWidth || tickmarkContainer.clientWidth || 1
    const msPerPx = vw / rulerW
    if (shouldShowAxisDateLine(vw, msPerPx)) {
      axisDateEl.textContent = formatAxisHeaderDates(viewLo, viewHi)
      axisDateEl.style.display = 'block'
    } else {
      axisDateEl.textContent = ''
      axisDateEl.style.display = 'none'
    }
  }

  const formatSessionSummaryText = async () => {
    const sum = await mock.getSessionSummary(sessionId)
    if (!sum) {
      return `Browser session id: ${sessionId}\n(no mock state)`
    }
    const { lockedParams, totalElements, materialized } = sum
    const lines = [
      `Browser session id: ${sessionId}`,
      '',
      'Mock generation mode: calendarAligned',
      '',
      'Locked range parameters:',
      `  zoom: ${lockedParams.zoom}`,
      `  unitSize (ms): ${lockedParams.unitSize}`,
      `  unitsPerViewportWidth: ${lockedParams.unitsPerViewportWidth}`,
      '',
      `Total intervals in store: ${totalElements}`,
      '',
      `Materialized axis coverage (${materialized.length} merged segment(s)):`,
    ]
    for (const [a, b] of materialized) {
      lines.push(`  [${a} … ${b}]  span ${(b - a).toFixed(3)} ms`)
    }
    if (materialized.length === 0) {
      lines.push('  (none yet)')
    }
    return lines.join('\n')
  }

  const render = async () => {
    const rangeStore = accessConversionStore(rangeId)
    const centerMs = getCurrentCenterMs()
    centerReadout.textContent = String(centerMs)
    datetimeInput.value = toDatetimeLocalValue(new Date(centerMs))

    const vMs = rangeEndpointsToMs(rangeStore.viewableRange as [unknown, unknown])
    const lMs = rangeEndpointsToMs(rangeStore.nextLeftRange as [unknown, unknown])
    const rMs = rangeEndpointsToMs(rangeStore.nextRightRange as [unknown, unknown])

    viewableValue.textContent = vMs.join(', ')
    nextLeftValue.textContent = lMs.join(', ')
    nextRightValue.textContent = rMs.join(', ')
    currentTicksValue.textContent = formatTicksLine(ticksInRange(vMs))
    zoomValue.textContent = dimensionalRange.zoom.toString()
    unitSizeValue.textContent = `${dimensionalRange.unitSize} (${TIME_GRANULARITY_LABEL[unitGranularity]})`
    upvwValue.textContent = dimensionalRange.unitsPerViewportWidth.toString()
    ticksAcrossValueEl.textContent = `${ticksAcrossViewable} (clamp ${MIN_TICKS_ACROSS}–${MAX_TICKS_ACROSS})`
    {
      const st = getTickStepFromPolicy()
      tickStepValueEl.textContent = Number.isFinite(st) ? String(Math.round(st)) : '—'
    }

    const leftZ: ZoneBounds = { lo: lMs[0], hi: lMs[1] }
    const centerZ: ZoneBounds = { lo: vMs[0], hi: vMs[1] }
    const rightZ: ZoneBounds = { lo: rMs[0], hi: rMs[1] }

    const totalLow = Math.min(leftZ.lo, centerZ.lo, rightZ.lo)
    const totalHigh = Math.max(leftZ.hi, centerZ.hi, rightZ.hi)
    const totalWidth = totalHigh - totalLow

    updateAxisContext(vMs[0], vMs[1])

    renderZoneBackgrounds(mockZonesLayer, totalLow, totalWidth, leftZ, centerZ, rightZ)

    if (Number.isFinite(totalWidth) && totalWidth > 0) {
      renderTickmarks(totalLow, totalWidth, centerZ)
      requestAnimationFrame(() => updateAxisContext(vMs[0], vMs[1]))
    } else {
      tickmarkRuler.innerHTML = ''
      mockZonesLayer.innerHTML = ''
      updateAxisContext(0, -1)
    }

    summaryPanel.textContent = await formatSessionSummaryText()

    if (Number.isFinite(totalWidth) && totalWidth > 0) {
      const elements = await mock.getElementsForRange(sessionId, [totalLow, totalHigh])
      renderMockBars(totalLow, totalWidth, elements, leftZ, centerZ, rightZ)
    } else {
      mockBarsLayer.innerHTML = ''
      mockCountLabel.textContent = '—'
    }
  }

  subscribeToRangeInitialization(rangeId, () => {
    void (async () => {
      await mock.ensureSession(sessionId, {
        zoom: dimensionalRange.zoom,
        unitSize: dimensionalRange.unitSize,
        unitsPerViewportWidth: dimensionalRange.unitsPerViewportWidth,
      })
      registerTicks(
        rangeId,
        async ([start, end]: [start: number, end: number]) => {
          return ticksInRange([start, end])
        },
        true
      )
      subscribeToTicksInitialization(rangeId, () => {
        void render()
      })
      subscribeToTicksLoadingComplete(rangeId, () => {
        void render()
      })
      await render()
    })()
  })

  registerDimensionalRange<Date>(rangeId, {
    initialInput: new Date(defaultInitialMs),
    dimensionalRange,
    inputToNumber: (d) => d.getTime(),
    numberToInput: (n) => new Date(n),
  })

  subscribeToDimensionalRangeConvertedEndLoading(rangeId, () => {
    void render()
  })
}
