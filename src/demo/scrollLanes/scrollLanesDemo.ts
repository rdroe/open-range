import { subscribeToRangeInitialization } from '../../lib/readableRange'
import {
  alignedTickStops,
  registerTicks,
  subscribeToTicksInitialization,
  subscribeToTicksLoadingComplete,
  ticksStore,
} from '../../lib/ticks'
import {
  DimensionalRange,
  registerDimensionalRange,
  updateDimensionalRange,
  updateDimensionalRangeParams,
} from '../../lib/dimensionalRange'
import { LANE_COLORS, RANGE_ID } from './constants'
import {
  bumpScrollLanesDataEpoch,
  mock2ToLane,
  scrollLanesMockStore,
  scrollLanesMockTags,
} from './mockData2Bridge'
import { fixPackByLane } from './packLanes'
import { groupByLane } from './generateElements'
import {
  contentPixels,
  defaultInitialScrollLeft,
  scrollLeftToVisDomain,
  timelineEnd as domainTimelineEnd,
  timelineStart as domainTimelineStart,
  viewablePixels,
  xToPx as mapXToContentPx,
  zoneName,
} from './scrollMapping'
import {
  clearScrollLanesUiStorage,
  DEFAULT_SCROLL_LANES_UI,
  loadScrollLanesUi,
  saveScrollLanesUi,
} from './scrollLanesUiStorage'
import type { AllLanesLayout, LaneElement, MountScrollLanesDemoOptions } from './types'

export type { MountScrollLanesDemoOptions } from './types'

export const mountScrollLanesDemo = (options: MountScrollLanesDemoOptions = {}) => {
  const { embedded = false } = options
  if (typeof document === 'undefined') return

  const originalRangeValue = 500
  const loadedUi = loadScrollLanesUi(originalRangeValue)

  const state = { ...DEFAULT_SCROLL_LANES_UI }
  if (loadedUi) {
    Object.assign(state, loadedUi.params)
  }

  let byLane: LaneElement[][] = groupByLane([])

  let shiftCount = loadedUi?.shiftCount ?? 0
  let currentRangeValue = loadedUi?.currentRangeValue ?? originalRangeValue
  const initialRestoredScrollLeft: number | undefined =
    loadedUi != null ? loadedUi.scrollLeft : undefined
  let layout: AllLanesLayout | null = null

  const getViewablePx = () => viewablePixels(state.aperturePx)
  const getContentPx = () =>
    contentPixels(getViewablePx(), state.leftPrefetchFactor, state.rightPrefetchFactor)
  const getT0 = () =>
    domainTimelineStart(
      currentRangeValue,
      state.viewableDomainWidth,
      state.leftPrefetchFactor
    )
  const getT1 = () =>
    domainTimelineEnd(
      currentRangeValue,
      state.viewableDomainWidth,
      state.rightPrefetchFactor
    )
  const getDomainSpan = () => getT1() - getT0()
  const mapXToPx = (x: number) => mapXToContentPx(x, getT0(), getT1(), getContentPx())
  const visDomainFromScroll = (scrollLeft: number) =>
    scrollLeftToVisDomain(
      scrollLeft,
      getT0(),
      getDomainSpan(),
      getContentPx(),
      state.aperturePx
    )
  const initialScrollLeft = () => defaultInitialScrollLeft(state.leftPrefetchFactor, getViewablePx())
  const zoneFor = (scrollLeft: number) => zoneName(scrollLeft, state.leftPrefetchFactor, getViewablePx())

  const rebuildDataAndPack = async (): Promise<AllLanesLayout> => {
    const t0 = getT0()
    const t1 = getT1()
    const rows = await scrollLanesMockStore.fetchRange(scrollLanesMockTags, { start: t0, end: t1 })
    const all = rows.map(mock2ToLane)
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
  const paramInputs = {} as Record<ParamKey, HTMLInputElement>
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
    paramInputs[key] = inp
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

  const mockActions = document.createElement('div')
  mockActions.style.cssText =
    'display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px;'
  const wipeMockBtn = document.createElement('button')
  wipeMockBtn.type = 'button'
  wipeMockBtn.textContent = 'Wipe mock session & regenerate'
  wipeMockBtn.setAttribute('data-testid', 'scroll-lanes-wipe-mock')
  wipeMockBtn.title =
    'Clear persisted scroll-lanes mock data for this browser session, then refetch. Keeps scroll position. Input is blocked until layout is ready.'
  wipeMockBtn.style.cssText = `
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    background: #27272a;
    color: #fafafa;
    font: inherit;
    cursor: pointer;
  `
  const resetLayoutBtn = document.createElement('button')
  resetLayoutBtn.type = 'button'
  resetLayoutBtn.textContent = 'Reset layout defaults (params + scroll + center)'
  resetLayoutBtn.setAttribute('data-testid', 'scroll-lanes-reset-layout')
  resetLayoutBtn.title =
    'Remove saved view settings from this browser, restore default numbers, scroll to the default view position, and reset the domain center. Does not clear mock block data (use the other button for that).'
  resetLayoutBtn.style.cssText = `
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #3f3f46;
    background: #1c1c1f;
    color: #fafafa;
    font: inherit;
    cursor: pointer;
  `
  mockActions.appendChild(wipeMockBtn)
  mockActions.appendChild(resetLayoutBtn)
  layoutRoot.appendChild(mockActions)

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

  const updateReadout = (scrollLeft: number) => {
    const { visStart, visEnd } = visDomainFromScroll(scrollLeft)
    const tf0 = getT0()
    const tf1 = getT1()
    if (lockVRef) {
      lockVRef.textContent = `scrollLeft=${Math.round(scrollLeft)} zone=${zoneFor(scrollLeft)}  center=${currentRangeValue.toFixed(2)} n=${shiftCount}`
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
        const wPx = mapXToPx(el.endX) - mapXToPx(el.startX)
        const left = mapXToPx(el.startX)
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
    const tStart = getT0()
    const tEnd = getT1()
    const step = state.tickStep
    if (step <= 0) return
    for (const v of alignedTickStops(tStart, tEnd, step, 0)) {
      const x = mapXToPx(v)
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
    const viewablePx = getViewablePx()
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
    centerLine.style.left = `${mapXToPx(currentRangeValue)}px`
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
    content.style.width = `${getContentPx()}px`
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

  const wipeMockSessionAndRegenerate = async () => {
    setLock(true)
    const savedScroll = aperture.scrollLeft
    try {
      bumpScrollLanesDataEpoch()
      await scrollLanesMockStore.clearForTags(scrollLanesMockTags)
      const L = await rebuildDataAndPack()
      const ts = ticksStore[RANGE_ID]
      setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
      layout = L
      fullRender()
      suppressScroll = true
      aperture.scrollLeft = savedScroll
      updateReadout(savedScroll)
      persistUi()
    } finally {
      setLock(false)
    }
  }

  wipeMockBtn.addEventListener('click', () => {
    void wipeMockSessionAndRegenerate()
  })

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
    return Promise.all([p, rebuildDataAndPack()]).then((r) => r[1] as AllLanesLayout)
  }

  const clampScroll = () => {
    const m = Math.max(0, content.scrollWidth - aperture.clientWidth)
    if (m <= 0) return
    if (aperture.scrollLeft > m) aperture.scrollLeft = m
  }

  const persistUi = () => {
    saveScrollLanesUi(state, aperture.scrollLeft, shiftCount)
  }
  let persistScrollTimer: number | undefined
  const schedulePersistScroll = () => {
    if (persistScrollTimer !== undefined) window.clearTimeout(persistScrollTimer)
    persistScrollTimer = window.setTimeout(() => {
      persistScrollTimer = undefined
      persistUi()
    }, 200)
  }

  const onShift = async (shift: number, scrollLeft: number) => {
    if (shift === 0) return
    setLock(true)
    const newScrollLeft = scrollLeft - shift * getViewablePx()
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
    persistUi()
    setLock(false)
  }

  let scrollEndTimer: number | undefined
  let suppressScroll = false
  const activePointerOnAperture = new Set<number>()
  let lastWheelTime = 0
  const isWheelDrivenWindow = () => performance.now() - lastWheelTime < 520

  const onScrollEndCheckShift = () => {
    const sl = aperture.scrollLeft
    if (suppressScroll) {
      suppressScroll = false
      return
    }
    if (scrollLocked) return
    const viewablePx = getViewablePx()
    const leftEdge = state.leftPrefetchFactor * viewablePx
    const rightEdge = leftEdge + viewablePx
    let shift = 0
    if (sl < leftEdge) shift = -1
    else if (sl > rightEdge) shift = 1
    if (shift === 0) return
    if (activePointerOnAperture.size > 0) {
      if (isWheelDrivenWindow()) {
        void onShift(shift, sl)
      }
      return
    }
    void onShift(shift, sl)
  }

  const flushScrollShiftAfterPointer = () => {
    if (scrollEndTimer !== undefined) {
      window.clearTimeout(scrollEndTimer)
      scrollEndTimer = undefined
    }
    onScrollEndCheckShift()
  }

  aperture.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      activePointerOnAperture.add(e.pointerId)
    },
    true
  )
  const pointerEnd = (e: PointerEvent) => {
    if (activePointerOnAperture.delete(e.pointerId) && activePointerOnAperture.size === 0) {
      flushScrollShiftAfterPointer()
    }
  }
  window.addEventListener('pointerup', pointerEnd)
  window.addEventListener('pointercancel', pointerEnd)

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
        currentRangeValue = originalRangeValue + shiftCount * state.viewableDomainWidth
        updateDimensionalRange(RANGE_ID, currentRangeValue)
        updateDimensionalRangeParams(RANGE_ID, dr)
      })
      const sl0 = initialScrollLeft()
      const ts = ticksStore[RANGE_ID]
      setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
      layout = L
      fullRender()
      suppressScroll = true
      aperture.scrollLeft = sl0
      updateReadout(sl0)
      persistUi()
      setLock(false)
    })()
  }

  const resetLayoutToDefaults = async () => {
    setLock(true)
    try {
      clearScrollLanesUiStorage()
      Object.assign(state, DEFAULT_SCROLL_LANES_UI)
      for (const k of Object.keys(paramInputs) as ParamKey[]) {
        paramInputs[k]!.value = String(state[k])
      }
      shiftCount = 0
      currentRangeValue = originalRangeValue
      const dr: DimensionalRange = {
        zoom: 1,
        unitSize: 1,
        unitsPerViewportWidth: state.viewableDomainWidth,
        leftPrefetchFactor: state.leftPrefetchFactor,
        rightPrefetchFactor: state.rightPrefetchFactor,
      }
      const L = await awaitTicksAndRebuildAfter(() => {
        updateDimensionalRange(RANGE_ID, originalRangeValue)
        updateDimensionalRangeParams(RANGE_ID, dr)
      })
      const ts = ticksStore[RANGE_ID]
      setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
      layout = L
      fullRender()
      suppressScroll = true
      const sl0 = initialScrollLeft()
      aperture.scrollLeft = sl0
      updateReadout(sl0)
      persistUi()
    } finally {
      setLock(false)
    }
  }

  resetLayoutBtn.addEventListener('click', () => {
    void resetLayoutToDefaults()
  })

  aperture.addEventListener('scroll', () => {
    const sl = aperture.scrollLeft
    updateReadout(sl)
    schedulePersistScroll()
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
      lastWheelTime = performance.now()
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
    initialInput: currentRangeValue,
    dimensionalRange: initialDr,
    inputToNumber: (n) => n,
    numberToInput: (n) => n,
  })

  subscribeToTicksInitialization(RANGE_ID, () => {
    void (async () => {
      setLock(true)
      const L = await rebuildDataAndPack()
      const ts = ticksStore[RANGE_ID]
      setTickReadout(ts ? ts.ticks.viewableRange.length : 0)
      layout = L
      fullRender()
      const maxL = Math.max(0, content.scrollWidth - aperture.clientWidth)
      const sl0 =
        initialRestoredScrollLeft !== undefined
          ? Math.min(Math.max(0, initialRestoredScrollLeft), maxL)
          : initialScrollLeft()
      suppressScroll = true
      aperture.scrollLeft = sl0
      updateReadout(sl0)
      persistUi()
      setLock(false)
    })()
  })
  registerTicks(RANGE_ID, makeTickFn(), true)

  subscribeToRangeInitialization(RANGE_ID, () => {
    fullRender()
  })
}
