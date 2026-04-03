import { accessConversionStore, subscribeToRangeInitialization } from '../lib/readableRange'
import type { TicksArray } from '../lib/ticks'
import {
  DimensionalRange,
  registerDimensionalRange,
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

const rangeId = 'dimensionalRangeNumeric'
const dimensionalRange: DimensionalRange = {
  zoom: 1,
  unitSize: 0.1,
  unitsPerViewportWidth: 10,
  leftPrefetchFactor: 2,
  rightPrefetchFactor: 2,
}
const convertAlphadex = (input: number) => input
const numberToAlphadex = (input: number) => input

export const createDimensionalExampleNumeric = () => {
  if (typeof document === 'undefined') return

  const initLetterRaw = Math.random() * 20
  const initLetter = Math.random() < 0.1 ? initLetterRaw : 0 - initLetterRaw

  let currentScroll: number | null = null

  const getCurrentLetter = () => currentScroll || initLetter

  const getViewableRangeWidth = (): number => {
    try {
      const rangeStore = accessConversionStore(rangeId)
      const [start, end] = rangeStore.viewableRange.map(convertAlphadex) as RangePair
      return Math.abs(end - start)
    } catch {
      const viewportWidth =
        (dimensionalRange.unitSize * dimensionalRange.unitsPerViewportWidth) /
        dimensionalRange.zoom
      return viewportWidth
    }
  }

  const incrementUtil = (letter: number) => {
    const n = convertAlphadex(letter)
    const viewableWidth = getViewableRangeWidth()
    return numberToAlphadex(n + viewableWidth)
  }

  const decrementUtil = (letter: number) => {
    const n = letter
    const viewableWidth = getViewableRangeWidth()
    return numberToAlphadex(n - viewableWidth)
  }

  type RangePair = [number, number]

  const formatTicksLine = (ticks: TicksArray<number>): string => {
    return ticks
      .map((t) => {
        const same =
          t.label === String(t.value) || t.label === `${t.value}`
        const text = same ? String(t.value) : `${t.value} (${t.label})`
        if (t.dimensions) {
          return `${text} [${t.dimensions.width}×${t.dimensions.height}]`
        }
        return text
      })
      .join(', ')
  }

  const ticksInRange = (range: RangePair): TicksArray<number> => {
    const [start, end] = range
    const ticks: TicksArray<number> = []
    if (!Number.isFinite(start) || !Number.isFinite(end)) return ticks
    const step = Math.max(dimensionalRange.unitSize, 0.1)
    if (step <= 0) return ticks
    for (const v of alignedTickStops(start, end, step, 0)) {
      const rounded = Math.round(v * 10) / 10
      ticks.push({ value: rounded, label: rounded.toString() })
    }
    return ticks
  }

  const root = document.createElement('div')
  root.id = 'dimensional-example-numeric'
  root.style.cssText = `
    position: fixed;
    top: 0;
    right: 400px;
    width: 400px;
    max-height: 80vh;
    overflow-y: auto;
    background-color: #1e1e1e;
    color: #d4d4d4;
    padding: 15px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    z-index: 10000;
    border-left: 2px solid #333;
    box-shadow: -2px 0 10px rgba(0,0,0,0.5);
    box-sizing: border-box;
  `

  const makeLabel = (text: string) => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.marginTop = '6px'
    return el
  }

  const makeValue = () => {
    const el = document.createElement('div')
    el.style.marginBottom = '4px'
    return el
  }

  const makeButton = (label: string, onClick: () => void) => {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.style.marginRight = '6px'
    btn.style.marginTop = '4px'
    btn.style.padding = '2px 8px'
    btn.style.background = '#333'
    btn.style.color = '#fff'
    btn.style.border = '1px solid #555'
    btn.style.borderRadius = '3px'
    btn.style.cursor = 'pointer'
    btn.addEventListener('click', onClick)
    return btn
  }

  const letterLabel = makeLabel('letter')
  const letterValue = makeValue()

  const letterButtonsRow = document.createElement('div')
  const prevBtn = makeButton('prev', () => {
    const prevLetter = decrementUtil(getCurrentLetter())
    currentScroll = prevLetter
    updateDimensionalRange(rangeId, prevLetter)
  })
  const nextBtn = makeButton('next', () => {
    const nextLetter = incrementUtil(getCurrentLetter())
    currentScroll = nextLetter
    updateDimensionalRange(rangeId, nextLetter)
  })

  letterButtonsRow.appendChild(prevBtn)
  letterButtonsRow.appendChild(nextBtn)

  const viewableLabel = makeLabel('viewableRange')
  const viewableValue = makeValue()
  const nextLeftLabel = makeLabel('nextLeftRange')
  const nextLeftValue = makeValue()
  const nextRightLabel = makeLabel('nextRightRange')
  const nextRightValue = makeValue()

  const currentTicksLabel = makeLabel('currentTicks')
  const currentTicksValue = makeValue()
  const nextLeftTicksLabel = makeLabel('nextLeftTicks')
  const nextLeftTicksValue = makeValue()
  const nextRightTicksLabel = makeLabel('nextRightTicks')
  const nextRightTicksValue = makeValue()

  const zoomLabel = makeLabel('zoom')
  const zoomValue = makeValue()
  const zoomInBtn = makeButton('zoom in', () => {
    dimensionalRange.zoom = dimensionalRange.zoom + 0.5
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })
  const zoomOutBtn = makeButton('zoom out', () => {
    dimensionalRange.zoom = dimensionalRange.zoom - 0.5
    if (dimensionalRange.zoom <= 0) dimensionalRange.zoom = 0.5
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })

  const unitSizeLabel = makeLabel('unitSize')
  const unitSizeValue = makeValue()
  const unitSizeUpBtn = makeButton('unitSize up', () => {
    dimensionalRange.unitSize = dimensionalRange.unitSize + 0.05
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })
  const unitSizeDownBtn = makeButton('unitSize down', () => {
    dimensionalRange.unitSize = dimensionalRange.unitSize - 0.05
    if (dimensionalRange.unitSize <= 0.01) dimensionalRange.unitSize = 0.01
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })

  const upvwLabel = makeLabel('unitsPerViewportWidth')
  const upvwValue = makeValue()
  const upvwUpBtn = makeButton('unitsPerViewportWidth up', () => {
    dimensionalRange.unitsPerViewportWidth = dimensionalRange.unitsPerViewportWidth + 1
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })
  const upvwDownBtn = makeButton('unitsPerViewportWidth down', () => {
    dimensionalRange.unitsPerViewportWidth = dimensionalRange.unitsPerViewportWidth - 1
    if (dimensionalRange.unitsPerViewportWidth <= 1) dimensionalRange.unitsPerViewportWidth = 1
    updateDimensionalRangeParams(rangeId, dimensionalRange)
  })

  root.appendChild(letterLabel)
  root.appendChild(letterValue)
  root.appendChild(letterButtonsRow)

  root.appendChild(viewableLabel)
  root.appendChild(viewableValue)
  root.appendChild(nextLeftLabel)
  root.appendChild(nextLeftValue)
  root.appendChild(nextRightLabel)
  root.appendChild(nextRightValue)

  root.appendChild(currentTicksLabel)
  root.appendChild(currentTicksValue)
  root.appendChild(nextLeftTicksLabel)
  root.appendChild(nextLeftTicksValue)
  root.appendChild(nextRightTicksLabel)
  root.appendChild(nextRightTicksValue)

  root.appendChild(zoomLabel)
  root.appendChild(zoomValue)
  root.appendChild(zoomInBtn)
  root.appendChild(zoomOutBtn)

  root.appendChild(unitSizeLabel)
  root.appendChild(unitSizeValue)
  root.appendChild(unitSizeUpBtn)
  root.appendChild(unitSizeDownBtn)

  root.appendChild(upvwLabel)
  root.appendChild(upvwValue)
  root.appendChild(upvwUpBtn)
  root.appendChild(upvwDownBtn)

  const tickmarkContainer = document.createElement('div')
  tickmarkContainer.id = 'tickmark-container'
  tickmarkContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 50px;
    width: 600px;
    height: 120px;
    background-color: #2a2a2a;
    border: 2px solid #555;
    border-radius: 8px;
    padding: 0;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    box-sizing: border-box;
  `

  const tickmarkRuler = document.createElement('div')
  tickmarkRuler.id = 'tickmark-ruler'
  tickmarkRuler.style.cssText = `
    position: relative;
    width: 100%;
    height: 60px;
    border-top: 2px solid #666;
    margin-top: 10px;
  `

  const tickmarkLabel = document.createElement('div')
  tickmarkLabel.textContent = 'Tickmarks'
  tickmarkLabel.style.cssText = `
    color: #d4d4d4;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 5px;
  `

  tickmarkContainer.appendChild(tickmarkLabel)
  tickmarkContainer.appendChild(tickmarkRuler)

  const renderTickmarks = () => {
    const rangeStore = accessConversionStore(rangeId)
    const ts = ticksStore[rangeId]
    if (!ts) return
    const ticks = ts.ticks.viewableRange
    if (ticks.length < 1) return
    const rangeWidth = ticks[ticks.length - 1]!.value - ticks[0]!.value
    const rangeStart = ticks[0]!.value

    tickmarkRuler.innerHTML = ''

    if (ticks.length === 0 || !Number.isFinite(rangeWidth) || rangeWidth === 0) {
      return
    }

    ticks.forEach(({ value: tick, label: tickStr }) => {
      if (!Number.isFinite(tick)) return

      const position = ((tick - rangeStart) / rangeWidth) * 100

      const tickLine = document.createElement('div')
      tickLine.style.cssText = `
        position: absolute;
        left: ${position}%;
        top: 0;
        width: 1px;
        height: 20px;
        background-color: #888;
        transform: translateX(-50%);
      `

      const tickLabel = document.createElement('div')
      tickLabel.textContent = tickStr
      tickLabel.style.cssText = `
        position: absolute;
        left: ${position}%;
        top: 22px;
        transform: translateX(-50%);
        color: #aaa;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        white-space: nowrap;
      `

      tickmarkRuler.appendChild(tickLine)
      tickmarkRuler.appendChild(tickLabel)
    })

    const centerPosition =
      ((convertAlphadex(rangeStore.input as number) - rangeStart) / rangeWidth) * 100
    const centerIndicator = document.createElement('div')
    centerIndicator.style.cssText = `
      position: absolute;
      left: ${centerPosition}%;
      top: 0;
      width: 2px;
      height: 30px;
      background-color: #4a9eff;
      transform: translateX(-50%);
      z-index: 10;
    `
    tickmarkRuler.appendChild(centerIndicator)
  }

  const render = () => {
    const rangeStore = accessConversionStore(rangeId)
    letterValue.textContent = `${rangeStore.input}`
    viewableValue.textContent = rangeStore.viewableRange.join(', ')
    nextLeftValue.textContent = rangeStore.nextLeftRange.join(', ')
    nextRightValue.textContent = rangeStore.nextRightRange.join(', ')
    currentTicksValue.textContent = formatTicksLine(
      ticksInRange(rangeStore.viewableRange.map(convertAlphadex) as RangePair)
    )
    nextLeftTicksValue.textContent = formatTicksLine(
      ticksInRange(rangeStore.nextLeftRange.map(convertAlphadex) as RangePair)
    )
    nextRightTicksValue.textContent = formatTicksLine(
      ticksInRange(rangeStore.nextRightRange.map(convertAlphadex) as RangePair)
    )
    zoomValue.textContent = dimensionalRange.zoom.toString()
    unitSizeValue.textContent = dimensionalRange.unitSize.toString()
    upvwValue.textContent = dimensionalRange.unitsPerViewportWidth.toString()

    renderTickmarks()
  }

  document.body.appendChild(root)
  document.body.appendChild(tickmarkContainer)
  subscribeToRangeInitialization(rangeId, () => {
    registerTicks(
      rangeId,
      async ([start, end]: [start: number, end: number]) => {
        return ticksInRange([start, end])
      },
      true
    )
    subscribeToTicksInitialization(rangeId, () => {
      render()
    })
    subscribeToTicksLoadingComplete(rangeId, () => {
      render()
    })

    render()
  })
  registerDimensionalRange(rangeId, {
    initialInput: initLetter,
    dimensionalRange,
    inputToNumber: convertAlphadex,
    numberToInput: numberToAlphadex,
  })
}
