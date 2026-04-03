import { describe, it, expect } from 'vitest'
import {
  emitters,
  getEventNames2,
  registerRange,
  store,
  subscribeToRangeEndLoading,
  subscribeToRangeStartLoading,
  updateRangeInputInner,
} from '../src/lib/basicRange'
import {
  conversionEmitters,
  getConversionEventNames,
  registerReadableRange,
  updateRange,
} from '../src/lib/readableRange'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

describe('internal EventTarget dispatch (basicRange)', () => {
  it('viewableRange event detail matches store after updateRangeInputInner', async () => {
    const rangeId = 'evt-br-view-1'
    const received: { viewableRange: [number, number] }[] = []
    registerRange(rangeId, 100, geo, false)
    emitters[rangeId].viewableRange.addEventListener(
      getEventNames2(rangeId).viewableRange,
      (e: Event) => {
        const ce = e as CustomEvent<{ viewableRange: [number, number] }>
        received.push({ viewableRange: ce.detail.viewableRange })
      }
    )
    updateRangeInputInner(rangeId, 110)
    await delay(250)
    expect(received.length).toBeGreaterThanOrEqual(1)
    const last = received[received.length - 1]
    expect(last.viewableRange).toEqual([105, 115])
    expect(store[rangeId].viewableRange).toEqual(last.viewableRange)
  })

  it('subscribeToRangeStartLoading / EndLoading receive loading channel events', async () => {
    const rangeId = 'evt-br-load-1'
    let starts = 0
    let ends = 0
    registerRange(rangeId, 50, geo, false)
    subscribeToRangeStartLoading(rangeId, () => {
      starts++
    })
    subscribeToRangeEndLoading(rangeId, () => {
      ends++
    })
    updateRangeInputInner(rangeId, 60)
    await delay(500)
    expect(starts).toBeGreaterThan(0)
    expect(ends).toBeGreaterThan(0)
  })

  it('inputChanged emitter carries new input in detail', async () => {
    const rangeId = 'evt-br-inp-1'
    const inputs: number[] = []
    registerRange(rangeId, 10, geo, false)
    emitters[rangeId].inputChanged.addEventListener(
      getEventNames2(rangeId).inputChanged,
      (e: Event) => {
        const ce = e as CustomEvent<{ input: number }>
        inputs.push(ce.detail.input)
      }
    )
    updateRangeInputInner(rangeId, 77)
    expect(inputs).toContain(77)
  })
})

describe('internal EventTarget dispatch (readableRange conversion)', () => {
  it('viewableRangeConverted fires with typed viewable in detail', async () => {
    const rangeId = 'evt-read-vc-1'
    const payloads: string[] = []
    await registerReadableRange<string>(
      rangeId,
      '5',
      {
        ...geo,
        inputToNumber: (s: string) => parseInt(s, 10),
        numberToInput: (n: number) => String(n),
      },
      false
    )
    conversionEmitters[rangeId].viewableRangeConverted.addEventListener(
      getConversionEventNames(rangeId).viewableRangeConverted,
      (e: Event) => {
        const ce = e as CustomEvent<{ viewableRange: [string, string] }>
        payloads.push(ce.detail.viewableRange.join('|'))
      }
    )
    updateRange(rangeId, '8')
    await delay(300)
    expect(payloads.length).toBeGreaterThan(0)
    expect(conversionEmitters[rangeId]).toBeDefined()
  })

  it('convertedViewableRangeLoading toggles true then false on updateRange', async () => {
    const rangeId = 'evt-read-vcl-1'
    const flags: boolean[] = []
    await registerReadableRange<string>(
      rangeId,
      '12',
      {
        ...geo,
        inputToNumber: (s: string) => parseInt(s, 10),
        numberToInput: (n: number) => String(n),
      },
      false
    )
    conversionEmitters[rangeId].convertedViewableRangeLoading.addEventListener(
      getConversionEventNames(rangeId).convertedViewableRangeLoading,
      (e: Event) => {
        const ce = e as CustomEvent<{ viewableRangeLoading: boolean }>
        flags.push(ce.detail.viewableRangeLoading)
      }
    )
    updateRange(rangeId, '15')
    await delay(350)
    expect(flags.length).toBeGreaterThan(0)
    expect(flags).toContain(true)
    expect(flags).toContain(false)
  })
})
