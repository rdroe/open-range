import { subscribeToRangeInitialization } from '../lib/readableRange'
import {
  alignedTickStops,
  registerTicks,
  subscribeToTicksInitialization,
  subscribeToTicksLoadingComplete,
  ticksStore,
} from '../lib/ticks'
import {
  DimensionalRange,
  registerDimensionalRange,
  updateDimensionalRange,
  updateDimensionalRangeParams,
} from '../lib/dimensionalRange'

const RANGE_ID = 'scrollLanesDemo'

export type MountScrollLanesDemoOptions = {
  embedded?: boolean
}

type LaneElement = {
  id: string
  tag3: string
  startX: number
  endX: number
  height: number
  laneId: 0 | 1 | 2 | 3 | 4
}

type RowState = { lastEnd: number; maxH: number; elements: LaneElement[] }

type LanePackResult = {
  items: { el: LaneElement; top: number }[]
  laneHeight: number
}

const LANE_COLORS = [
  'rgba(96,165,250,0.45)',
  'rgba(52,211,153,0.45)',
  'rgba(251,191,36,0.5)',
  'rgba(192,132,252,0.45)',
  'rgba(248,113,113,0.45)',
] as const

const mulberry32 = (a: number) => {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const groupByLane = (all: LaneElement[]): LaneElement[][] => {
  const by: LaneElement[][] = [[], [], [], [], []]
  for (const e of all) {
    by[e.laneId]!.push(e)
  }
  return by
}

const DOMAIN_GRID_STEP = 0.85

const makeTag3 = (seed: number) => {
  const a = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let u = seed >>> 0
  let t = ''
  for (let i = 0; i < 3; i++) {
    t += a[u % 36]!
    u = (Math.imul(u, 0x1f) + 0x7e1 + i) >>> 0
  }
  return t
}

const widthScale2to5 = (s0: number) => 2 + mulberry32(s0)() * 3

const blockHeightForSeed = (s0: number) => {
  const r0 = mulberry32((s0 * 0x1f) >>> 0)()
  const r1 = mulberry32((s0 * 0x2d) >>> 0)()
  return 10 + Math.floor(r0 * 46) + Math.floor(r1 * 28)
}

const cellKeySeed = (g: number, lane: number, k: number) => {
  return (Math.imul(g, 0x9e37) + Math.imul(lane, 0x1f) + (k * 0x1d) + 0x6d2b79f5) >>> 0
}

const DENSE_LANE: LaneElement['laneId'] = 2

const generateElementsForRange = (t0: number, t1: number): LaneElement[] => {
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
        const s0 = cellKeySeed(g, lane, k)
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
        const laneId = lane as LaneElement['laneId']
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
    const s0 = cellKeySeed(g, DENSE_LANE, 90)
    if (mulberry32(s0)() > 0.35) continue
    const wRaw = 0.18 + mulberry32(s0 * 2)() * 0.22
    const w = Math.min(wRaw * widthScale2to5(s0 * 0x1e), inner * 0.98)
    const t0b = cell0 + inner * 0.1
    if (t0b + w > cell1 || t0b + w <= t0 || t0b >= t1) continue
    const cSeed = cellKeySeed(g, DENSE_LANE, 91)
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

const packOneLane = (elements: LaneElement[], packStart: number, packEnd: number): LanePackResult => {
  const vis = elements.filter((e) => e.endX > packStart && e.startX < packEnd)
  if (vis.length === 0) {
    return { items: [], laneHeight: 32 }
  }
  const sorted = [...vis].sort((a, b) => a.startX - b.startX)
  const rows: RowState[] = []
  for (const el of sorted) {
    let bestIdx = -1
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!
      if (row.lastEnd <= el.startX) {
        bestIdx = r
        break
      }
    }
    if (bestIdx < 0) {
      rows.push({ lastEnd: el.endX, maxH: el.height, elements: [el] })
    } else {
      const row = rows[bestIdx]!
      row.elements.push(el)
      row.lastEnd = Math.max(...row.elements.map((e) => e.endX))
      row.maxH = Math.max(row.maxH, el.height)
    }
  }
  const items: { el: LaneElement; top: number }[] = []
  let y = 0
  for (const row of rows) {
    for (const el of row.elements) {
      items.push({ el, top: y })
    }
    y += row.maxH
  }
  return { items, laneHeight: Math.max(32, y) }
}

type AllLanesLayout = { lanes: [LanePackResult, LanePackResult, LanePackResult, LanePackResult, LanePackResult] }

const fixPackByLane = (byLane: LaneElement[][], packStart: number, packEnd: number): AllLanesLayout => {
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

export const mountScrollLanesDemo = (options: MountScrollLanesDemoOptions = {}) => {
  const { embedded = false } = options
  if (typeof document === 'undefined') return

  const state = {
    viewableDomainWidth: 100,
    leftPrefetchFactor: 1,
    rightPrefetchFactor: 1,
    aperturePx: 720,
    tickStep: 20,
  }

  let byLane: LaneElement[][] = groupByLane([])

  const originalRangeValue = 500
  let shiftCount = 0
  let currentRangeValue = originalRangeValue
  let layout: AllLanesLayout | null = null

  const viewablePixels = () => state.aperturePx * 2
  const contentPixels = () =>
    viewablePixels() * (state.leftPrefetchFactor + 1 + state.rightPrefetchFactor)

  const timelineStart = () =>
    currentRangeValue -
    state.viewableDomainWidth / 2 -
    state.leftPrefetchFactor * state.viewableDomainWidth
  const timelineEnd = () =>
    currentRangeValue +
    state.viewableDomainWidth / 2 +
    state.rightPrefetchFactor * state.viewableDomainWidth

  const domainSpan = () => timelineEnd() - timelineStart()
  const xToPx = (x: number) => {
    const s = domainSpan()
    if (s <= 0) return 0
    return ((x - timelineStart()) / s) * contentPixels()
  }

  const scrollLeftToVisDomain = (scrollLeft: number): { visStart: number; visEnd: number } => {
    const t0 = timelineStart()
    const span = domainSpan()
    const c = contentPixels()
    const a = state.aperturePx
    const p0 = (scrollLeft / c) * span
    const p1 = ((scrollLeft + a) / c) * span
    return { visStart: t0 + p0, visEnd: t0 + p1 }
  }

  const defaultInitialScrollLeft = () => {
    const vp = viewablePixels()
    return state.leftPrefetchFactor * vp + vp / 4
  }

  const rebuildDataAndPack = (): AllLanesLayout => {
    const t0 = timelineStart()
    const t1 = timelineEnd()
    const all = generateElementsForRange(t0, t1)
    byLane = groupByLane(all)
    return fixPackByLane(byLane, t0, t1)
  }

  const layoutRoot = document.createElement('div')
  layoutRoot.style.cssText = `
    min-height: ${embedded ? 'auto' : '100vh'};
    background: #0d0d0f;
    color: #e4e4e7;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    font-size: 13px;
    padding: 16px 24px;
    box-sizing: border-box;
  `

  if (!embedded) {
    const nav = document.createElement('div')
    nav.style.cssText =
      'padding-bottom: 12px; border-bottom: 1px solid #27272a; margin-bottom: 16px;'
    const back = document.createElement('a')
    back.href = '/index.html'
    back.textContent = '\u2190 All demos (home)'
    back.style.cssText = 'color: #93c5fd; text-decoration: none; font-size: 14px;'
    nav.appendChild(back)
    layoutRoot.appendChild(nav)
  }

  const title = document.createElement('h2')
  title.textContent = 'Scroll-box lanes: greedy row packing + async lane heights'
  title.style.cssText = 'margin: 0 0 6px; font-size: 16px; color: #fafafa;'
  layoutRoot.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.textContent =
    'Five swimlanes; greedy row packing over the entire scrollable domain (nextLeft+viewable+nextRight). Data and y-layout are fixed for that full span so horizontal pan does not reflow. Pixels at the min/max scroll positions are pre-populated before input unlocks; tick load and lane pack still run together on a shift or param change.'
  subtitle.style.cssText = 'color: #a1a1aa; font-size: 12px; margin-bottom: 14px; max-width: 920px; line-height: 1.5;'
  layoutRoot.appendChild(subtitle)

  const paramsPanel = document.createElement('div')
  paramsPanel.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px 18px;
    margin-bottom: 14px;
    padding: 12px 14px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 8px;
  `

  type ParamKey = 'viewableDomainWidth' | 'leftPrefetchFactor' | 'rightPrefetchFactor' | 'aperturePx' | 'tickStep'
  const makeInput = (key: ParamKey, label: string) => {
    const wrap = document.createElement('label')
    wrap.style.cssText =
      'display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #a1a1aa;'
    const lab = document.createElement('span')
    lab.textContent = label
    const inp = document.createElement('input')
    inp.type = 'number'
    inp.step = 'any'
    inp.value = String(state[key])
    inp.setAttribute('data-testid', `scroll-lanes-param-${key}`)
    inp.style.cssText =
      'padding: 6px 8px; border-radius: 6px; border: 1px solid #3f3f46; background: #0c0c0e; color: #fafafa; font: inherit;'
    inp.addEventListener('change', () => {
      const v = Number(inp.value)
      if (!Number.isFinite(v) || v <= 0) {
        inp.value = String(state[key])
        return
      }
      state[key] = v
      applyParams()
    })
    wrap.appendChild(lab)
    wrap.appendChild(inp)
    return wrap
  }

  paramsPanel.appendChild(
    makeInput('viewableDomainWidth', 'viewable width (domain units, number axis)')
  )
  paramsPanel.appendChild(makeInput('leftPrefetchFactor', 'leftPrefetchFactor'))
  paramsPanel.appendChild(makeInput('rightPrefetchFactor', 'rightPrefetchFactor'))
  paramsPanel.appendChild(makeInput('aperturePx', 'aperture width (px)'))
  paramsPanel.appendChild(makeInput('tickStep', 'tick step (domain)'))
  layoutRoot.appendChild(paramsPanel)

  const statusRow = document.createElement('div')
  statusRow.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 6px 16px;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: #0c0c0e;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #d4d4d8;
  `
  const mk = (label: string) => {
    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;'
    const l = document.createElement('span')
    l.textContent = label
    l.style.cssText = 'color: #71717a; flex-shrink: 0;'
    const v = document.createElement('span')
    v.style.cssText = 'color: #fafafa; word-break: break-all;'
    row.appendChild(l)
    row.appendChild(v)
    return { row, v }
  }
  const r1 = mk('scroll + domain:')
  const r2 = mk('aperture slice + packed span:')
  const r3 = mk('ticks in viewable (last load):')
  const r4 = mk('lane stack height (px):')
  const r5 = mk('aperture pointer events:')
  r5.row.style.flexWrap = 'nowrap'
  r5.row.style.alignItems = 'center'
  r5.v.style.flex = '1 1 0'
  r5.v.style.minWidth = '0'
  r5.v.style.height = '1.35em'
  r5.v.style.maxHeight = '1.35em'
  r5.v.style.lineHeight = '1.35'
  r5.v.style.overflow = 'hidden'
  r5.v.style.whiteSpace = 'nowrap'
  r5.v.style.textOverflow = 'ellipsis'
  statusRow.appendChild(r1.row)
  statusRow.appendChild(r2.row)
  statusRow.appendChild(r3.row)
  statusRow.appendChild(r4.row)
  statusRow.appendChild(r5.row)
  layoutRoot.appendChild(statusRow)
  const lockVRef = r1.v
  const visVRef = r2.v
  const tickVRef = r3.v
  const laneHRef = r4.v
  const lockStateRef = r5.v
  lockStateRef.textContent = 'auto'
  lockStateRef.title = 'Aperture accepts pointer and wheel input.'

  const aperture = document.createElement('div')
  aperture.setAttribute('data-testid', 'scroll-lanes-aperture')
  aperture.style.cssText = `
    position: relative;
    overflow: auto;
    width: ${state.aperturePx}px;
    max-width: 100%;
    min-height: 200px;
    max-height: min(72vh, 640px);
    background: #141416;
    border: 1px solid #52525b;
    border-radius: 8px;
    scroll-behavior: auto;
  `

  const content = document.createElement('div')
  content.style.cssText = 'position: relative; width: 100px;'
  aperture.appendChild(content)
  layoutRoot.appendChild(aperture)

  const zonesLayer = document.createElement('div')
  zonesLayer.style.cssText = 'position: absolute; inset: 0; z-index: 0; pointer-events: none;'
  content.appendChild(zonesLayer)

  const tickLayer = document.createElement('div')
  tickLayer.style.cssText = 'position: absolute; inset: 0; z-index: 1; pointer-events: none;'
  content.appendChild(tickLayer)

  const swimWrap = document.createElement('div')
  swimWrap.style.cssText = 'position: relative; z-index: 2; min-height: 1px;'
  content.appendChild(swimWrap)

  const centerLine = document.createElement('div')
  centerLine.style.cssText = `
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(180deg, #60a5fa, #3b82f6);
    transform: translateX(-1px);
    z-index: 4;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(59,130,246,0.5);
  `
  content.appendChild(centerLine)

  const laneEls: HTMLDivElement[] = []
  for (let i = 0; i < 5; i++) {
    const lane = document.createElement('div')
    lane.setAttribute('data-testid', `scroll-lane-${i}`)
    lane.style.cssText = `
      position: relative;
      width: 100%;
      min-height: 32px;
      box-sizing: border-box;
      border-top: 1px solid #3f3f46;
    `
    const lab = document.createElement('div')
    lab.textContent = `lane ${i}`
    lab.style.cssText =
      'position: absolute; left: 4px; top: 2px; font-size: 10px; color: #71717a; z-index: 3; pointer-events: none;'
    lane.appendChild(lab)
    swimWrap.appendChild(lane)
    laneEls.push(lane)
  }

  const zoneName = (scrollLeft: number): 'nextLeft' | 'viewable' | 'nextRight' => {
    const viewablePx = viewablePixels()
    const leftEdge = state.leftPrefetchFactor * viewablePx
    const rightEdge = leftEdge + viewablePx
    if (scrollLeft < leftEdge) return 'nextLeft'
    if (scrollLeft > rightEdge) return 'nextRight'
    return 'viewable'
  }

  const updateReadout = (scrollLeft: number) => {
    const { visStart, visEnd } = scrollLeftToVisDomain(scrollLeft)
    const tf0 = timelineStart()
    const tf1 = timelineEnd()
    if (lockVRef) {
      lockVRef.textContent = `scrollLeft=${Math.round(scrollLeft)} zone=${zoneName(scrollLeft)}  center=${currentRangeValue.toFixed(2)} n=${shiftCount}`
    }
    if (visVRef) {
      visVRef.textContent = `aperture ${visStart.toFixed(1)}–${visEnd.toFixed(1)}  ·  full span (packed) ${tf0.toFixed(1)}–${tf1.toFixed(1)}`
    }
  }

  const setTickReadout = (n: number) => {
    if (tickVRef) tickVRef.textContent = String(n)
  }

  const setLaneHReadout = (h: number) => {
    if (laneHRef) laneHRef.textContent = String(h)
  }

  let scrollLocked = false
  const setLock = (on: boolean) => {
    scrollLocked = on
    aperture.style.pointerEvents = on ? 'none' : ''
    if (lockStateRef) {
      lockStateRef.textContent = on ? 'blocked' : 'auto'
      lockStateRef.title = on
        ? 'Input paused until tick load and lane layout finish (shift or param change).'
        : 'Aperture accepts pointer and wheel input.'
    }
  }

  const paintLaneBlocks = (L: AllLanesLayout) => {
    let yOff = 0
    for (let li = 0; li < 5; li++) {
      const lane = laneEls[li]!
      const pack = L.lanes[li]!
      lane.innerHTML = ''
      const lab = document.createElement('div')
      lab.textContent = `lane ${li} (${pack.laneHeight}px)`
      lab.style.cssText =
        'position: absolute; left: 4px; top: 2px; font-size: 10px; color: #71717a; z-index: 3; pointer-events: none;'
      lane.appendChild(lab)
      lane.style.height = `${pack.laneHeight}px`
      lane.style.position = 'relative'
      for (const { el, top } of pack.items) {
        const wPx = xToPx(el.endX) - xToPx(el.startX)
        const left = xToPx(el.startX)
        const b = document.createElement('div')
        b.setAttribute('data-testid', `scroll-lane-block-${el.id}`)
        const cap = `${el.tag3} ${el.startX.toFixed(1)} ${el.endX.toFixed(1)} ${el.height}`
        b.textContent = cap
        b.title = cap
        b.style.cssText = `
          position: absolute;
          left: ${left}px;
          top: ${top}px;
          width: ${Math.max(1, wPx)}px;
          height: ${el.height}px;
          background: ${LANE_COLORS[el.laneId]};
          border: 1px solid rgba(250,250,250,0.2);
          border-radius: 2px;
          box-sizing: border-box;
          display: flex;
          align-items: flex-start;
          padding: 1px 3px;
          font: 8px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
          color: rgba(250,250,250,0.95);
          text-shadow: 0 0 1px #000, 0 0 2px #000;
          white-space: nowrap;
          overflow: hidden;
        `
        lane.appendChild(b)
      }
      yOff += pack.laneHeight
    }
    setLaneHReadout(yOff)
  }

  const drawTicks = () => {
    tickLayer.innerHTML = ''
    const tStart = timelineStart()
    const tEnd = timelineEnd()
    const step = state.tickStep
    if (step <= 0) return
    for (const v of alignedTickStops(tStart, tEnd, step, 0)) {
      const x = xToPx(v)
      const line = document.createElement('div')
      line.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: 18px;
        bottom: 0;
        width: 1px;
        background: rgba(253, 230, 138, 0.45);
        transform: translateX(-0.5px);
      `
      const label = document.createElement('div')
      label.textContent = String(Math.round(v * 10) / 10)
      label.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: 0;
        font-size: 10px;
        color: #fde68a;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        transform: translateX(-50%);
      `
      tickLayer.appendChild(line)
      tickLayer.appendChild(label)
    }
  }

  const drawZones = () => {
    zonesLayer.innerHTML = ''
    const viewablePx = viewablePixels()
    const leftPx = state.leftPrefetchFactor * viewablePx
    const rightStartPx = leftPx + viewablePx
    const rightPx = state.rightPrefetchFactor * viewablePx
    const zl = document.createElement('div')
    zl.style.cssText = `position: absolute; left: 0; top: 0; width: ${leftPx}px; height: 100%; background: rgba(96,165,250,0.06); border-right: 1px dashed rgba(161,161,170,0.3);`
    const zc = document.createElement('div')
    zc.style.cssText = `position: absolute; left: ${leftPx}px; top: 0; width: ${viewablePx}px; height: 100%; background: rgba(244,244,245,0.04);`
    const zr = document.createElement('div')
    zr.style.cssText = `position: absolute; left: ${rightStartPx}px; top: 0; width: ${rightPx}px; height: 100%; background: rgba(96,165,250,0.06); border-left: 1px dashed rgba(161,161,170,0.3);`
    zonesLayer.appendChild(zl)
    zonesLayer.appendChild(zc)
    zonesLayer.appendChild(zr)
  }

  const applyLayout = (L: AllLanesLayout) => {
    layout = L
    drawZones()
    drawTicks()
    paintLaneBlocks(L)
    centerLine.style.left = `${xToPx(currentRangeValue)}px`
  }

  const fullRender = () => {
    aperture.style.width = `${state.aperturePx}px`
    const totalH = layout
      ? layout.lanes[0]!.laneHeight +
        layout.lanes[1]!.laneHeight +
        layout.lanes[2]!.laneHeight +
        layout.lanes[3]!.laneHeight +
        layout.lanes[4]!.laneHeight
      : 5 * 32
    const cy = totalH
    content.style.width = `${contentPixels()}px`
    content.style.minHeight = `${cy}px`
    tickLayer.style.height = `${cy}px`
    zonesLayer.style.height = `${cy}px`
    centerLine.style.height = `${cy}px`
    if (layout) {
      applyLayout(layout)
    }
    void requestAnimationFrame(() => {
      clampScroll()
    })
  }

  const waitAllTicksOnce = () =>
    new Promise<void>((resolve) => {
      const u = subscribeToTicksLoadingComplete(RANGE_ID, () => {
        u()
        resolve()
      })
    })

  const awaitTicksAndRebuildAfter = (applyUpdate: () => void) => {
    const p = waitAllTicksOnce()
    applyUpdate()
    return Promise.all([p, Promise.resolve().then(() => rebuildDataAndPack())]).then(
      (r) => r[1] as AllLanesLayout
    )
  }

  const clampScroll = () => {
    const m = Math.max(0, content.scrollWidth - aperture.clientWidth)
    if (m <= 0) return
    if (aperture.scrollLeft > m) aperture.scrollLeft = m
  }

  const onShift = async (shift: number, scrollLeft: number) => {
    if (shift === 0) return
    setLock(true)
    const newScrollLeft = scrollLeft - shift * viewablePixels()
    const L = await awaitTicksAndRebuildAfter(() => {
      shiftCount += shift
      currentRangeValue = originalRangeValue + shiftCount * state.viewableDomainWidth
      updateDimensionalRange(RANGE_ID, currentRangeValue)
    })
    const ts = ticksStore[RANGE_ID]
    setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
    layout = L
    fullRender()
    suppressScroll = true
    aperture.scrollLeft = newScrollLeft
    updateReadout(newScrollLeft)
    setLock(false)
  }

  let scrollEndTimer: number | undefined
  let suppressScroll = false
  const onScrollEndCheckShift = () => {
    const sl = aperture.scrollLeft
    if (suppressScroll) {
      suppressScroll = false
      return
    }
    if (scrollLocked) return
    const viewablePx = viewablePixels()
    const leftEdge = state.leftPrefetchFactor * viewablePx
    const rightEdge = leftEdge + viewablePx
    let shift = 0
    if (sl < leftEdge) shift = -1
    else if (sl > rightEdge) shift = 1
    if (shift === 0) return
    void onShift(shift, sl)
  }

  const applyParams = () => {
    const dr: DimensionalRange = {
      zoom: 1,
      unitSize: 1,
      unitsPerViewportWidth: state.viewableDomainWidth,
      leftPrefetchFactor: state.leftPrefetchFactor,
      rightPrefetchFactor: state.rightPrefetchFactor,
    }
    void (async () => {
      setLock(true)
      const L = await awaitTicksAndRebuildAfter(() => {
        updateDimensionalRangeParams(RANGE_ID, dr)
      })
      const sl0 = defaultInitialScrollLeft()
      const ts = ticksStore[RANGE_ID]
      setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
      layout = L
      fullRender()
      suppressScroll = true
      aperture.scrollLeft = sl0
      updateReadout(sl0)
      setLock(false)
    })()
  }

  aperture.addEventListener('scroll', () => {
    const sl = aperture.scrollLeft
    updateReadout(sl)
    if (scrollEndTimer) clearTimeout(scrollEndTimer)
    scrollEndTimer = window.setTimeout(() => onScrollEndCheckShift(), 130)
  })

  aperture.addEventListener(
    'wheel',
    (e) => {
      if (scrollLocked) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      const d = e.deltaX !== 0 ? e.deltaX : e.deltaY
      aperture.scrollLeft += d
    },
    { passive: false }
  )

  const makeTickFn = () => {
    return async ([a, b]: [number, number]) => {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      await new Promise((r) => setTimeout(r, 18))
      const out: { value: number; label: string }[] = []
      for (const v of alignedTickStops(lo, hi, state.tickStep, 0)) {
        out.push({ value: v, label: String(v) })
      }
      return out
    }
  }

  const mount = document.getElementById('scroll-lanes-demo') ?? document.body
  mount.appendChild(layoutRoot)

  const initialDr: DimensionalRange = {
    zoom: 1,
    unitSize: 1,
    unitsPerViewportWidth: state.viewableDomainWidth,
    leftPrefetchFactor: state.leftPrefetchFactor,
    rightPrefetchFactor: state.rightPrefetchFactor,
  }

  registerDimensionalRange<number>(RANGE_ID, {
    initialInput: originalRangeValue,
    dimensionalRange: initialDr,
    inputToNumber: (n) => n,
    numberToInput: (n) => n,
  })

  subscribeToTicksInitialization(RANGE_ID, () => {
    const sl0 = defaultInitialScrollLeft()
    setLock(true)
    const L = rebuildDataAndPack()
    const ts = ticksStore[RANGE_ID]
    setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
    layout = L
    fullRender()
    suppressScroll = true
    aperture.scrollLeft = sl0
    updateReadout(sl0)
    setLock(false)
  })
  registerTicks(RANGE_ID, makeTickFn(), true)

  subscribeToRangeInitialization(RANGE_ID, () => {
    fullRender()
  })
}
