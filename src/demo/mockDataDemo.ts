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

const rangeId = 'mockDataDimensionalDemo'

const mockPersistence = createIndexedDbKeyValue('open-range-mock-demo')
const mock = createMockData({ persistence: mockPersistence })

const dimensionalRange: DimensionalRange = {
  zoom: 1,
  unitSize: 0.1,
  unitsPerViewportWidth: 10,
  leftPrefetchFactor: 2,
  rightPrefetchFactor: 2,
}

/** Target tick count across the viewable span; spacing ≈ viewableWidth ÷ this (shared step for all zones). */
let ticksAcrossViewable = 12
const MIN_TICKS_ACROSS = 3
const MAX_TICKS_ACROSS = 120

function normalizePair(pair: [number, number]): [number, number] {
  const [a, b] = pair
  return a <= b ? [a, b] : [b, a]
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

/** Same interval length → same hue (log-scaled so tiny vs large spans spread across the spectrum). */
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

/** Same interval (start/end) → same lane across pans; order of elements in the array does not matter. */
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

export const mountMockDataDemo = () => {
  if (typeof document === 'undefined') return

  let sessionId = getOrCreateBrowserSessionId()
  const defaultInitialInput = 0
  let currentScroll: number | null = null
  const getCurrentLetter = () => currentScroll ?? defaultInitialInput

  const getViewableRangeWidth = (): number => {
    try {
      const rangeStore = accessConversionStore(rangeId)
      const [start, end] = rangeStore.viewableRange as [number, number]
      return Math.abs(end - start)
    } catch {
      return (
        (dimensionalRange.unitSize * dimensionalRange.unitsPerViewportWidth) /
        dimensionalRange.zoom
      )
    }
  }

  const incrementUtil = (letter: number) => {
    const viewableWidth = getViewableRangeWidth()
    return letter + viewableWidth
  }

  const decrementUtil = (letter: number) => {
    const viewableWidth = getViewableRangeWidth()
    return letter - viewableWidth
  }

  type RangePair = [number, number]

  /** Data-domain step from “ticks across view”: same step everywhere so ruler lines up across prefetch. */
  const getTickStepFromPolicy = (): number => {
    const w = getViewableRangeWidth()
    if (!Number.isFinite(w) || w <= 0) return 0.1
    return Math.max(w / Math.max(1, ticksAcrossViewable), Number.EPSILON * 1000)
  }

  /** Print tick values with at most 2 decimal places (ruler + readouts). */
  const formatTickPrint = (v: number): string => {
    if (!Number.isFinite(v)) return String(v)
    const rounded = Math.round(v * 100) / 100
    return String(Number(rounded.toFixed(2)))
  }

  const ticksInRange = (range: RangePair): TicksArray<number> => {
    const [start, end] = range
    const ticks: TicksArray<number> = []
    if (!Number.isFinite(start) || !Number.isFinite(end)) return ticks
    const step = getTickStepFromPolicy()
    if (step <= 0) return ticks
    const labelFor = (v: number) => {
      const rounded = Math.round(v * 100) / 100
      return { value: rounded, label: formatTickPrint(rounded) }
    }
    for (const v of alignedTickStops(start, end, step, 0)) {
      ticks.push(labelFor(v))
    }
    return ticks
  }

  const layout = document.createElement('div')
  layout.style.cssText = `
    min-height: 100vh;
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
  back.textContent = '← Original range demos'
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
    'Full axis: prefetch left (faded) · viewable · prefetch right (faded) — ticks & mock intervals'
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

  const tickmarkRuler = document.createElement('div')
  tickmarkRuler.style.cssText = `
    position: relative;
    width: 100%;
    height: 56px;
    border-top: 2px solid #52525b;
    margin-top: 4px;
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
    'Mock intervals — hue by length (opacity by zone) · each interval keeps a fixed lane while you pan'
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
  root.id = 'mock-data-demo-panel'
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
    wrap.style.cssText = 'display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; align-items: baseline; margin-bottom: 6px; font-size: 12px;'
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

  colPan.appendChild(sectionTitle('Pan & input'))
  const { wrap: wInput, valueEl: letterValue } = kv('input (center)')
  const letterButtonsRow = document.createElement('div')
  letterButtonsRow.style.cssText = 'display: flex; flex-wrap: wrap; margin-bottom: 8px;'
  letterButtonsRow.appendChild(
    makeButton('← Prev', 'muted', () => {
      const prevLetter = decrementUtil(getCurrentLetter())
      currentScroll = prevLetter
      updateDimensionalRange(rangeId, prevLetter)
    })
  )
  letterButtonsRow.appendChild(
    makeButton('Next →', 'muted', () => {
      const nextLetter = incrementUtil(getCurrentLetter())
      currentScroll = nextLetter
      updateDimensionalRange(rangeId, nextLetter)
    })
  )

  /** Pan by a fraction of the current viewable width (Prev/Next use ±1×). */
  const bumpByViewportFraction = (viewportFraction: number) => {
    const w = getViewableRangeWidth()
    const next = getCurrentLetter() + viewportFraction * w
    currentScroll = next
    updateDimensionalRange(rangeId, next)
  }

  const finePanLabel = document.createElement('div')
  finePanLabel.textContent =
    'Fine pan (fraction × viewport width — Prev/Next = 1× viewport)'
  finePanLabel.style.cssText =
    'font-size: 11px; color: #71717a; margin: 10px 0 6px; font-weight: 500; line-height: 1.35;'

  const makeFineStepRow = (fraction: number, label: string) => {
    const row = document.createElement('div')
    row.style.cssText =
      'display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px;'
    const lab = document.createElement('span')
    lab.textContent = `±${label}`
    lab.style.cssText =
      'font-size: 11px; color: #71717a; font-variant-numeric: tabular-nums; min-width: 3.25rem;'
    row.appendChild(lab)
    row.appendChild(
      makeButton(`−${label}`, 'muted', () => {
        bumpByViewportFraction(-fraction)
      })
    )
    row.appendChild(
      makeButton(`+${label}`, 'muted', () => {
        bumpByViewportFraction(fraction)
      })
    )
    return row
  }

  /** Fractions of one viewable span (same scale family as Prev/Next at 1×). */
  const fineSteps: [number, string][] = [
    [0.5, '0.5×'],
    [0.25, '0.25×'],
    [0.1, '0.1×'],
  ]

  colPan.appendChild(wInput)
  colPan.appendChild(letterButtonsRow)
  colPan.appendChild(finePanLabel)
  for (const [step, label] of fineSteps) {
    colPan.appendChild(makeFineStepRow(step, label))
  }

  colDims.appendChild(sectionTitle('Range density'))
  const { wrap: wZoom, valueEl: zoomValue } = kv('zoom')
  const { wrap: wUnit, valueEl: unitSizeValue } = kv('unitSize')
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
  zoomRow.appendChild(
    makeButton('Zoom −0.1', 'muted', () => {
      dimensionalRange.zoom = clampZoom(dimensionalRange.zoom - 0.1)
      void applyDensityAndRender()
    })
  )
  zoomRow.appendChild(
    makeButton('Zoom +0.1', 'muted', () => {
      dimensionalRange.zoom = dimensionalRange.zoom + 0.1
      void applyDensityAndRender()
    })
  )
  const unitRow = document.createElement('div')
  unitRow.style.cssText = 'display: flex; flex-wrap: wrap; margin-bottom: 4px;'
  unitRow.appendChild(
    makeButton('Unit −', 'muted', () => {
      dimensionalRange.unitSize = dimensionalRange.unitSize - 0.05
      if (dimensionalRange.unitSize <= 0.01) dimensionalRange.unitSize = 0.01
      void applyDensityAndRender()
    })
  )
  unitRow.appendChild(
    makeButton('Unit +', 'muted', () => {
      dimensionalRange.unitSize = dimensionalRange.unitSize + 0.05
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

  const tickHint = document.createElement('div')
  tickHint.textContent =
    'Spacing ≈ viewable width ÷ count. Same step for left / view / right so marks align. (Related: “units / viewport” sets how wide the view is in data units.)'
  tickHint.style.cssText =
    'font-size: 11px; color: #71717a; line-height: 1.45; margin-bottom: 8px; max-width: 42ch;'

  const { wrap: wTicksAcross, valueEl: ticksAcrossValueEl } = kv('ticks across view')
  const { wrap: wTickStep, valueEl: tickStepValueEl } = kv('tick step (data units)')
  const { wrap: wTicksPerUnit, valueEl: ticksPerUnitValueEl } = kv('ticks / data unit (≈)')

  const adjustTicksAcross = (delta: number) => {
    ticksAcrossViewable = Math.min(
      MAX_TICKS_ACROSS,
      Math.max(MIN_TICKS_ACROSS, ticksAcrossViewable + delta)
    )
    void applyDensityAndRender()
  }

  const tickGridRow = document.createElement('div')
  tickGridRow.style.cssText =
    'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; align-items: center;'
  tickGridRow.appendChild(
    makeButton('−10', 'muted', () => {
      adjustTicksAcross(-10)
    })
  )
  tickGridRow.appendChild(
    makeButton('−1', 'muted', () => {
      adjustTicksAcross(-1)
    })
  )
  tickGridRow.appendChild(
    makeButton('+1', 'muted', () => {
      adjustTicksAcross(1)
    })
  )
  tickGridRow.appendChild(
    makeButton('+10', 'muted', () => {
      adjustTicksAcross(10)
    })
  )

  colDims.appendChild(wZoom)
  colDims.appendChild(zoomRow)
  colDims.appendChild(wUnit)
  colDims.appendChild(unitRow)
  colDims.appendChild(wUpvw)
  colDims.appendChild(upvwRow)
  colDims.appendChild(sectionTitle('Tick grid'))
  colDims.appendChild(tickHint)
  colDims.appendChild(wTicksAcross)
  colDims.appendChild(wTickStep)
  colDims.appendChild(wTicksPerUnit)
  colDims.appendChild(tickGridRow)

  colRead.appendChild(sectionTitle('Computed ranges'))
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
  summaryTitle.textContent = 'Session summary (full store)'
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
    'One browser session (localStorage id + IndexedDB intervals), shared across tabs until clear. Zoom and density sliders update the view and future gap generation without wiping stored intervals; only “Clear all mock data” resets session data.'
  hint.style.cssText = 'margin-top: 14px; color: #71717a; font-size: 12px; line-height: 1.5;'

  root.appendChild(summaryTitle)
  root.appendChild(summaryPanel)
  root.appendChild(hint)

  controlsShell.appendChild(root)

  layout.appendChild(nav)
  layout.appendChild(visualSection)
  layout.appendChild(controlsShell)

  const mount = document.getElementById('mock-data-demo')
  if (mount) mount.appendChild(layout)
  else document.body.appendChild(layout)

  /** Only for “Clear all mock data”: new session id + wipe stored intervals. */
  const resyncMockSession = async () => {
    updateDimensionalRangeParams(rangeId, dimensionalRange)
    await mock.clearSession(sessionId)
    await mock.ensureSession(sessionId, {
      zoom: dimensionalRange.zoom,
      unitSize: dimensionalRange.unitSize,
      unitsPerViewportWidth: dimensionalRange.unitsPerViewportWidth,
    })
  }

  /** Zoom / unit size / UPVW: keep IndexedDB intervals; update open-range geometry + mock generation params. */
  const applyDensityAndRender = async () => {
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

  const renderTickmarks = (
    totalStart: number,
    totalWidth: number,
    centerBounds: ZoneBounds
  ) => {
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
          top: 18px;
          transform: translateX(-50%);
          color: rgba(228, 228, 231, ${0.5 + opacity * 0.5});
          font-size: 10px;
          white-space: nowrap;
          opacity: ${opacity};
        `
        tickmarkRuler.appendChild(tickLine)
        tickmarkRuler.appendChild(tickLabel)
      })
    })

    const rangeStore = accessConversionStore(rangeId)
    const inputNum = rangeStore.input as number
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

    const rangeStore = accessConversionStore(rangeId)
    const inputNum = rangeStore.input as number
    const cx = ((inputNum - rangeStart) / rangeWidth) * 100
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

    mockCountLabel.textContent = `in view: ${elements.length} total · ${nL} left · ${nC} viewable · ${nR} right (by interval midpoint)`
  }

  const formatTicksLine = (ticks: TicksArray<number>): string => {
    return ticks
      .map((t) => {
        const vPrint = formatTickPrint(t.value as number)
        const same = t.label === vPrint || t.label === String(t.value)
        const text = same ? vPrint : `${vPrint} (${t.label})`
        return text
      })
      .join(', ')
  }

  const formatSessionSummaryText = async () => {
    const sum = await mock.getSessionSummary(sessionId)
    if (!sum) {
      return `Browser session id: ${sessionId}\n(no mock state — ensureSession failed or cleared)`
    }
    const { lockedParams, totalElements, materialized } = sum
    const lines = [
      `Browser session id: ${sessionId}`,
      '',
      'Locked range parameters:',
      `  zoom: ${lockedParams.zoom}`,
      `  unitSize: ${lockedParams.unitSize}`,
      `  unitsPerViewportWidth: ${lockedParams.unitsPerViewportWidth}`,
      '',
      `Total intervals in store: ${totalElements}`,
      '',
      `Materialized axis coverage (${materialized.length} merged segment(s)):`,
    ]
    for (const [a, b] of materialized) {
      lines.push(`  [${a} … ${b}]  span ${(b - a).toFixed(6)}`)
    }
    if (materialized.length === 0) {
      lines.push('  (none yet)')
    }
    return lines.join('\n')
  }

  const render = async () => {
    const rangeStore = accessConversionStore(rangeId)
    letterValue.textContent = `${rangeStore.input}`
    viewableValue.textContent = rangeStore.viewableRange.join(', ')
    nextLeftValue.textContent = rangeStore.nextLeftRange.join(', ')
    nextRightValue.textContent = rangeStore.nextRightRange.join(', ')
    currentTicksValue.textContent = formatTicksLine(
      ticksInRange(rangeStore.viewableRange as RangePair)
    )
    zoomValue.textContent = dimensionalRange.zoom.toString()
    unitSizeValue.textContent = dimensionalRange.unitSize.toString()
    upvwValue.textContent = dimensionalRange.unitsPerViewportWidth.toString()
    ticksAcrossValueEl.textContent = `${ticksAcrossViewable} (clamp ${MIN_TICKS_ACROSS}–${MAX_TICKS_ACROSS})`
    {
      const st = getTickStepFromPolicy()
      tickStepValueEl.textContent = Number.isFinite(st)
        ? st >= 1
          ? st.toFixed(4).replace(/\.?0+$/, '')
          : st.toPrecision(5)
        : '—'
      const w = getViewableRangeWidth()
      const tpu =
        Number.isFinite(st) && st > 0 && Number.isFinite(w) && w > 0 ? 1 / st : NaN
      ticksPerUnitValueEl.textContent = Number.isFinite(tpu)
        ? tpu >= 10 || tpu <= 0.1
          ? tpu.toPrecision(4)
          : tpu.toFixed(4).replace(/\.?0+$/, '')
        : '—'
    }

    const L = normalizePair(rangeStore.nextLeftRange as [number, number])
    const V = normalizePair(rangeStore.viewableRange as [number, number])
    const R = normalizePair(rangeStore.nextRightRange as [number, number])

    const leftZ: ZoneBounds = { lo: L[0], hi: L[1] }
    const centerZ: ZoneBounds = { lo: V[0], hi: V[1] }
    const rightZ: ZoneBounds = { lo: R[0], hi: R[1] }

    const totalLow = Math.min(leftZ.lo, centerZ.lo, rightZ.lo)
    const totalHigh = Math.max(leftZ.hi, centerZ.hi, rightZ.hi)
    const totalWidth = totalHigh - totalLow

    renderZoneBackgrounds(mockZonesLayer, totalLow, totalWidth, leftZ, centerZ, rightZ)

    if (Number.isFinite(totalWidth) && totalWidth > 0) {
      renderTickmarks(totalLow, totalWidth, centerZ)
    } else {
      tickmarkRuler.innerHTML = ''
      mockZonesLayer.innerHTML = ''
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

  registerDimensionalRange<number>(rangeId, {
    initialInput: defaultInitialInput,
    dimensionalRange,
    inputToNumber: (n) => n,
    numberToInput: (n) => n,
  })

  subscribeToDimensionalRangeConvertedEndLoading(rangeId, () => {
    void render()
  })
}

mountMockDataDemo()
