/**
 * Minimal UI wired directly to basicRange, readableRange, and ticks — for Playwright e2e
 * of core library behavior (no dimensional/mock layers).
 */
import {
  registerRange,
  store,
  updateRangeInputInner,
  subscribeToRangeViewableRange,
} from '../lib/basicRange'
import {
  accessConversionStore,
  registerReadableRange,
  subscribeToRangeConvertedEndLoading,
  updateRange,
} from '../lib/readableRange'
import { registerTicks, subscribeToTicksLoadingComplete, ticksStore } from '../lib/ticks'

const BASIC = 'e2e-harness-basic'
const READ = 'e2e-harness-read'
const TICK = 'e2e-harness-ticks'

const geo = {
  getViewableRange: async (input: number): Promise<[number, number]> => [
    input - 5,
    input + 5,
  ],
  getNextLeftRange: async (input: number): Promise<[number, number]> => [
    input - 20,
    input - 5,
  ],
  getNextRightRange: async (input: number): Promise<[number, number]> => [
    input + 5,
    input + 20,
  ],
}

function el(
  tag: string,
  attrs: Record<string, string>,
  text?: string
): HTMLElement {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    n.setAttribute(k, v)
  }
  if (text !== undefined) n.textContent = text
  return n
}

function syncBasic(
  basicInput: HTMLElement,
  basicView: HTMLElement
): void {
  const s = store[BASIC]
  if (!s) return
  basicInput.textContent = String(s.input)
  basicView.textContent = s.viewableRange.join(', ')
}

function syncRead(readInput: HTMLElement): void {
  try {
    readInput.textContent = String(accessConversionStore<string>(READ).input)
  } catch {
    readInput.textContent = '—'
  }
}

function syncTicks(tickCount: HTMLElement, tickFirst: HTMLElement): void {
  const ts = ticksStore[TICK]
  const vr = ts?.ticks?.viewableRange ?? []
  tickCount.textContent = String(vr.length)
  tickFirst.textContent = vr[0] ? String(vr[0].label) : '—'
}

export async function mountLibraryHarness(): Promise<void> {
  const root = document.getElementById('library-harness-root')
  if (!root) return

  root.style.cssText =
    'font-family: system-ui, sans-serif; padding: 16px; max-width: 720px; color: #111;'

  const h1 = el('h1', {}, 'Library harness (basic · readable · ticks)')
  h1.style.fontSize = '1.1rem'
  root.appendChild(h1)

  const basicInput = el('div', { 'data-testid': 'e2e-basic-input-value' })
  const basicView = el('div', { 'data-testid': 'e2e-basic-viewable' })
  const sec1 = el('section', { 'data-testid': 'e2e-section-basic' })
  sec1.appendChild(el('h2', {}, 'basicRange'))
  sec1.appendChild(el('p', {}, 'input:'))
  sec1.appendChild(basicInput)
  sec1.appendChild(el('p', {}, 'viewable:'))
  sec1.appendChild(basicView)
  const btnBasic = el(
    'button',
    { type: 'button', 'data-testid': 'e2e-basic-nudge' },
    'Nudge input +10'
  )
  sec1.appendChild(btnBasic)

  const readInput = el('div', { 'data-testid': 'e2e-readable-input' })
  const sec2 = el('section', { 'data-testid': 'e2e-section-readable' })
  sec2.appendChild(el('h2', {}, 'readableRange (string)'))
  sec2.appendChild(el('p', {}, 'conversion input:'))
  sec2.appendChild(readInput)
  const btnRead = el(
    'button',
    { type: 'button', 'data-testid': 'e2e-readable-set-42' },
    'Set input to 42'
  )
  sec2.appendChild(btnRead)

  const tickCount = el('div', { 'data-testid': 'e2e-tick-viewable-count' })
  const tickFirst = el('div', { 'data-testid': 'e2e-tick-first-label' })
  const sec3 = el('section', { 'data-testid': 'e2e-section-ticks' })
  sec3.appendChild(el('h2', {}, 'ticks + readableRange (number)'))
  sec3.appendChild(el('p', {}, 'viewable tick count:'))
  sec3.appendChild(tickCount)
  sec3.appendChild(el('p', {}, 'first tick label:'))
  sec3.appendChild(tickFirst)
  const btnTick = el(
    'button',
    { type: 'button', 'data-testid': 'e2e-ticks-pan' },
    'Pan center to 205'
  )
  sec3.appendChild(btnTick)

  root.appendChild(sec1)
  root.appendChild(sec2)
  root.appendChild(sec3)

  registerRange(BASIC, 100, geo, false)
  subscribeToRangeViewableRange(BASIC, () => {
    syncBasic(basicInput, basicView)
  })
  syncBasic(basicInput, basicView)

  await registerReadableRange<string>(
    READ,
    '20',
    {
      ...geo,
      inputToNumber: (s: string) => parseInt(s, 10),
      numberToInput: (n: number) => String(n),
    },
    false
  )
  subscribeToRangeConvertedEndLoading(READ, () => {
    syncRead(readInput)
  })
  syncRead(readInput)

  await registerReadableRange<number>(
    TICK,
    200,
    {
      ...geo,
      inputToNumber: (n: number) => n,
      numberToInput: (n: number) => n,
    },
    false
  )
  subscribeToTicksLoadingComplete(TICK, () => {
    syncTicks(tickCount, tickFirst)
  })
  registerTicks(
    TICK,
    async ([start, end]: [number, number]) => {
      const out: { value: number; label: string }[] = []
      const lo = Math.min(start, end)
      const hi = Math.max(start, end)
      for (let v = Math.ceil(lo); v <= hi; v += 1) {
        out.push({ value: v, label: `t${v}` })
      }
      return out
    },
    true
  )

  btnBasic.addEventListener('click', () => {
    updateRangeInputInner(BASIC, store[BASIC].input + 10)
  })

  btnRead.addEventListener('click', () => {
    updateRange(READ, '42')
  })

  btnTick.addEventListener('click', () => {
    updateRange(TICK, 205)
  })

  await new Promise((r) => setTimeout(r, 400))
  syncBasic(basicInput, basicView)
  syncRead(readInput)
  syncTicks(tickCount, tickFirst)
}

void mountLibraryHarness()
