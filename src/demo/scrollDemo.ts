import {
  DimensionalRange,
  registerDimensionalRange,
  updateDimensionalRange,
  updateDimensionalRangeParams,
} from '../lib/dimensionalRange'
import { subscribeToRangeInitialization } from '../lib/readableRange'

const RANGE_ID = 'scrollDateDemo'

export type MountScrollDemoOptions = {
  embedded?: boolean
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export const mountScrollDemo = (options: MountScrollDemoOptions = {}) => {
  const { embedded = false } = options
  if (typeof document === 'undefined') return

  const state = {
    viewableRangeMs: 7 * DAY_MS,
    leftPrefetchFactor: 1,
    rightPrefetchFactor: 1,
    aperturePx: 800,
    tickIntervalMs: DAY_MS,
    contentStepMs: HOUR_MS,
  }

  const originalRangeValueMs = Date.now()
  let shiftCount = 0
  let currentRangeValueMs = originalRangeValueMs

  const viewablePixels = () => state.aperturePx * 2
  const contentPixels = () =>
    viewablePixels() * (state.leftPrefetchFactor + 1 + state.rightPrefetchFactor)
  const timelineStartMs = () =>
    currentRangeValueMs -
    state.viewableRangeMs / 2 -
    state.leftPrefetchFactor * state.viewableRangeMs
  const timelineEndMs = () =>
    currentRangeValueMs +
    state.viewableRangeMs / 2 +
    state.rightPrefetchFactor * state.viewableRangeMs
  const msToPx = (ms: number) => {
    const start = timelineStartMs()
    const span = timelineEndMs() - start
    return ((ms - start) / span) * contentPixels()
  }

  const layout = document.createElement('div')
  layout.style.cssText = `
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
    layout.appendChild(nav)
  }

  const title = document.createElement('h2')
  title.textContent = 'Scroll-based dimensionalRange demo (datetime)'
  title.style.cssText = 'margin: 0 0 6px; font-size: 16px; color: #fafafa;'
  layout.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.textContent =
    'Scroll horizontally inside the aperture. When the scroll position lands outside the viewable sector, rangeValue jumps by one full viewable range and content + scroll are remapped in one tick.'
  subtitle.style.cssText = 'color: #a1a1aa; font-size: 12px; margin-bottom: 14px; max-width: 880px;'
  layout.appendChild(subtitle)

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

  type ParamKey = keyof typeof state
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
    inp.setAttribute('data-testid', `scroll-param-${key}`)
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

  paramsPanel.appendChild(makeInput('viewableRangeMs', 'viewable range (ms) \u2014 7d default'))
  paramsPanel.appendChild(makeInput('leftPrefetchFactor', 'leftPrefetchFactor'))
  paramsPanel.appendChild(makeInput('rightPrefetchFactor', 'rightPrefetchFactor'))
  paramsPanel.appendChild(makeInput('aperturePx', 'aperture width (px)'))
  paramsPanel.appendChild(makeInput('tickIntervalMs', 'tick interval (ms)'))
  paramsPanel.appendChild(makeInput('contentStepMs', 'content step (ms, hourly)'))

  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.textContent = 'Reset to original rangeValue'
  resetBtn.style.cssText =
    'align-self: end; padding: 6px 12px; border-radius: 6px; border: 1px solid #52525b; background: #27272a; color: #fafafa; cursor: pointer; font: inherit;'
  resetBtn.addEventListener('click', () => {
    shiftCount = 0
    currentRangeValueMs = originalRangeValueMs
    updateDimensionalRange(RANGE_ID, new Date(currentRangeValueMs))
    render()
    setInitialScroll()
  })
  paramsPanel.appendChild(resetBtn)

  layout.appendChild(paramsPanel)

  const infoPanel = document.createElement('div')
  infoPanel.style.cssText = `
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
  const kvRow = (label: string) => {
    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 6px;'
    const l = document.createElement('span')
    l.textContent = label
    l.style.cssText = 'color: #71717a; flex-shrink: 0;'
    const v = document.createElement('span')
    v.style.cssText = 'color: #fafafa; word-break: break-all;'
    row.appendChild(l)
    row.appendChild(v)
    return { row, v }
  }
  const origKv = kvRow('original rangeValue:')
  const curKv = kvRow('current rangeValue:')
  const shiftKv = kvRow('shift count (n):')
  const viewKv = kvRow('viewable window:')
  const scrollKv = kvRow('scroll / zone:')
  infoPanel.appendChild(origKv.row)
  infoPanel.appendChild(curKv.row)
  infoPanel.appendChild(shiftKv.row)
  infoPanel.appendChild(viewKv.row)
  infoPanel.appendChild(scrollKv.row)
  layout.appendChild(infoPanel)

  const aperture = document.createElement('div')
  aperture.setAttribute('data-testid', 'scroll-aperture')
  aperture.style.cssText = `
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    width: ${state.aperturePx}px;
    height: 360px;
    background: #141416;
    border: 1px solid #52525b;
    border-radius: 8px;
    scroll-behavior: auto;
  `

  const content = document.createElement('div')
  content.style.cssText = `
    position: relative;
    height: 100%;
    width: 100px;
  `
  aperture.appendChild(content)
  layout.appendChild(aperture)

  const zonesLayer = document.createElement('div')
  zonesLayer.style.cssText = 'position: absolute; inset: 0; z-index: 0; pointer-events: none;'
  content.appendChild(zonesLayer)

  const ticksLayer = document.createElement('div')
  ticksLayer.style.cssText = 'position: absolute; inset: 0; z-index: 1; pointer-events: none;'
  content.appendChild(ticksLayer)

  const dataLayer = document.createElement('div')
  dataLayer.style.cssText = 'position: absolute; inset: 0; z-index: 2; pointer-events: none;'
  content.appendChild(dataLayer)

  const centerLine = document.createElement('div')
  centerLine.style.cssText = `
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(180deg, #60a5fa, #3b82f6);
    transform: translateX(-1px);
    z-index: 3;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(59,130,246,0.6);
  `
  content.appendChild(centerLine)

  const formatIso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

  const render = () => {
    aperture.style.width = `${state.aperturePx}px`
    content.style.width = `${contentPixels()}px`

    const tStart = timelineStartMs()
    const tEnd = timelineEndMs()

    zonesLayer.innerHTML = ''
    const viewablePx = viewablePixels()
    const leftPx = state.leftPrefetchFactor * viewablePx
    const rightStartPx = leftPx + viewablePx
    const rightPx = state.rightPrefetchFactor * viewablePx

    const zl = document.createElement('div')
    zl.style.cssText = `position: absolute; left: 0; top: 0; width: ${leftPx}px; height: 100%; background: rgba(96,165,250,0.07); border-right: 1px dashed rgba(161,161,170,0.4);`
    const zc = document.createElement('div')
    zc.style.cssText = `position: absolute; left: ${leftPx}px; top: 0; width: ${viewablePx}px; height: 100%; background: rgba(244,244,245,0.05);`
    const zr = document.createElement('div')
    zr.style.cssText = `position: absolute; left: ${rightStartPx}px; top: 0; width: ${rightPx}px; height: 100%; background: rgba(96,165,250,0.07); border-left: 1px dashed rgba(161,161,170,0.4);`
    const zlLabel = document.createElement('div')
    zlLabel.textContent = 'nextLeft'
    zlLabel.style.cssText =
      'position: absolute; left: 8px; top: 6px; font-size: 10px; color: #93c5fd; opacity: 0.8; font-family: ui-monospace, monospace;'
    const zcLabel = document.createElement('div')
    zcLabel.textContent = 'viewable'
    zcLabel.style.cssText = `position: absolute; left: ${leftPx + 8}px; top: 6px; font-size: 10px; color: #fafafa; opacity: 0.8; font-family: ui-monospace, monospace;`
    const zrLabel = document.createElement('div')
    zrLabel.textContent = 'nextRight'
    zrLabel.style.cssText = `position: absolute; left: ${rightStartPx + 8}px; top: 6px; font-size: 10px; color: #93c5fd; opacity: 0.8; font-family: ui-monospace, monospace;`
    zonesLayer.appendChild(zl)
    zonesLayer.appendChild(zc)
    zonesLayer.appendChild(zr)
    zonesLayer.appendChild(zlLabel)
    zonesLayer.appendChild(zcLabel)
    zonesLayer.appendChild(zrLabel)

    ticksLayer.innerHTML = ''
    const tickStep = state.tickIntervalMs
    if (tickStep > 0 && Number.isFinite(tickStep)) {
      const firstTick = Math.ceil(tStart / tickStep) * tickStep
      for (let t = firstTick; t <= tEnd; t += tickStep) {
        const x = msToPx(t)
        const line = document.createElement('div')
        line.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: 22px;
          bottom: 0;
          width: 1px;
          background: rgba(253, 230, 138, 0.55);
          transform: translateX(-0.5px);
        `
        const label = document.createElement('div')
        label.textContent = formatIso(t)
        label.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: 24px;
          writing-mode: vertical-rl;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: #fde68a;
          white-space: nowrap;
          transform: translateX(-50%);
          padding-top: 2px;
        `
        ticksLayer.appendChild(line)
        ticksLayer.appendChild(label)
      }
    }

    dataLayer.innerHTML = ''
    const step = state.contentStepMs
    if (step > 0 && Number.isFinite(step)) {
      const firstItem = Math.ceil(tStart / step) * step
      for (let t = firstItem; t <= tEnd; t += step) {
        const x = msToPx(t)
        const item = document.createElement('div')
        item.textContent = String(t)
        item.style.cssText = `
          position: absolute;
          left: ${x}px;
          bottom: 8px;
          writing-mode: vertical-rl;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          color: #86efac;
          white-space: nowrap;
          transform: translateX(-50%);
        `
        dataLayer.appendChild(item)
      }
    }

    centerLine.style.left = `${msToPx(currentRangeValueMs)}px`

    origKv.v.textContent = `${formatIso(originalRangeValueMs)} (${originalRangeValueMs})`
    curKv.v.textContent = `${formatIso(currentRangeValueMs)} (${currentRangeValueMs})`
    shiftKv.v.textContent = String(shiftCount)
    viewKv.v.textContent = `[${formatIso(currentRangeValueMs - state.viewableRangeMs / 2)}, ${formatIso(currentRangeValueMs + state.viewableRangeMs / 2)}]`
    updateScrollReadout()
  }

  const zoneForScroll = (scrollLeft: number): 'nextLeft' | 'viewable' | 'nextRight' => {
    const viewablePx = viewablePixels()
    const leftEdge = state.leftPrefetchFactor * viewablePx
    const rightEdge = leftEdge + viewablePx
    if (scrollLeft < leftEdge) return 'nextLeft'
    if (scrollLeft > rightEdge) return 'nextRight'
    return 'viewable'
  }

  const updateScrollReadout = () => {
    scrollKv.v.textContent = `scrollLeft=${Math.round(aperture.scrollLeft)}px  zone=${zoneForScroll(aperture.scrollLeft)}`
  }

  const setInitialScroll = () => {
    const viewablePx = viewablePixels()
    const leftEdgeOfViewable = state.leftPrefetchFactor * viewablePx
    suppressScrollHandling = true
    aperture.scrollLeft = leftEdgeOfViewable + viewablePx / 4
    updateScrollReadout()
  }

  let scrollEndTimer: number | undefined
  let suppressScrollHandling = false

  const onScrollEnd = () => {
    updateScrollReadout()
    if (suppressScrollHandling) {
      suppressScrollHandling = false
      return
    }
    const scrollLeft = aperture.scrollLeft
    const viewablePx = viewablePixels()
    const leftEdge = state.leftPrefetchFactor * viewablePx
    const rightEdge = leftEdge + viewablePx

    let shift = 0
    if (scrollLeft < leftEdge) shift = -1
    else if (scrollLeft > rightEdge) shift = 1
    if (shift === 0) return

    shiftCount += shift
    currentRangeValueMs = originalRangeValueMs + shiftCount * state.viewableRangeMs
    const newScrollLeft = scrollLeft - shift * viewablePx

    updateDimensionalRange(RANGE_ID, new Date(currentRangeValueMs))

    suppressScrollHandling = true
    render()
    aperture.scrollLeft = newScrollLeft
  }

  aperture.addEventListener('scroll', () => {
    updateScrollReadout()
    if (scrollEndTimer) clearTimeout(scrollEndTimer)
    scrollEndTimer = window.setTimeout(onScrollEnd, 140)
  })

  const applyParams = () => {
    const dr: DimensionalRange = {
      zoom: 1,
      unitSize: state.contentStepMs,
      unitsPerViewportWidth: state.viewableRangeMs / state.contentStepMs,
      leftPrefetchFactor: state.leftPrefetchFactor,
      rightPrefetchFactor: state.rightPrefetchFactor,
    }
    updateDimensionalRangeParams(RANGE_ID, dr)
    render()
    setInitialScroll()
  }

  const mount = document.getElementById('scroll-demo') ?? document.body
  mount.appendChild(layout)

  subscribeToRangeInitialization(RANGE_ID, () => {
    render()
    setInitialScroll()
  })

  const initialDr: DimensionalRange = {
    zoom: 1,
    unitSize: state.contentStepMs,
    unitsPerViewportWidth: state.viewableRangeMs / state.contentStepMs,
    leftPrefetchFactor: state.leftPrefetchFactor,
    rightPrefetchFactor: state.rightPrefetchFactor,
  }
  registerDimensionalRange<Date>(RANGE_ID, {
    initialInput: new Date(originalRangeValueMs),
    dimensionalRange: initialDr,
    inputToNumber: (d) => d.getTime(),
    numberToInput: (n) => new Date(n),
  })
}
