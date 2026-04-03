import { describe, it, expect } from 'vitest'
import {
  accessConversionStore,
  registerReadableRange,
  unregisterReadableRange,
} from '../src/lib/readableRange'
import {
  registerDimensionalRange,
  unregisterDimensionalRange,
  updateDimensionalRange,
  updateDimensionalRangeParams,
  subscribeToDimensionalRangeConvertedEndLoading,
} from '../src/lib/dimensionalRange'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const baseDim = {
  zoom: 2,
  unitSize: 0.1,
  leftPrefetchFactor: 1,
  rightPrefetchFactor: 1,
  unitsPerViewportWidth: 10,
}

describe('dimensionalRange', () => {
  it('registerDimensionalRange wires zoom-based geometry and updateDimensionalRange updates input', async () => {
    const rangeId = 'dim-wire-1'
    registerDimensionalRange<number>(rangeId, {
      initialInput: 100,
      dimensionalRange: baseDim,
      inputToNumber: (n) => n,
      numberToInput: (n) => n,
    })
    await delay(400)
    expect(accessConversionStore<number>(rangeId).input).toBe(100)
    updateDimensionalRange(rangeId, 110)
    await delay(350)
    expect(accessConversionStore<number>(rangeId).input).toBe(110)
    unregisterDimensionalRange(rangeId)
  })

  it('updateDimensionalRangeParams changes viewport width (zoom)', async () => {
    const rangeId = 'dim-params-1'
    registerDimensionalRange<number>(rangeId, {
      initialInput: 50,
      dimensionalRange: baseDim,
      inputToNumber: (n) => n,
      numberToInput: (n) => n,
    })
    await delay(400)
    const w0 =
      accessConversionStore<number>(rangeId).viewableRange[1] -
      accessConversionStore<number>(rangeId).viewableRange[0]
    updateDimensionalRangeParams(rangeId, { ...baseDim, zoom: 4 })
    await delay(400)
    updateDimensionalRange(rangeId, 50)
    await delay(350)
    const w1 =
      accessConversionStore<number>(rangeId).viewableRange[1] -
      accessConversionStore<number>(rangeId).viewableRange[0]
    expect(w1).toBeLessThan(w0)
    unregisterDimensionalRange(rangeId)
  })

  it('subscribeToDimensionalRangeConvertedEndLoading runs after updates', async () => {
    const rangeId = 'dim-sub-1'
    let n = 0
    registerDimensionalRange<number>(rangeId, {
      initialInput: 20,
      dimensionalRange: baseDim,
      inputToNumber: (x) => x,
      numberToInput: (x) => x,
    })
    await delay(350)
    subscribeToDimensionalRangeConvertedEndLoading(rangeId, () => {
      n++
    })
    updateDimensionalRange(rangeId, 25)
    await delay(400)
    expect(n).toBeGreaterThan(0)
    unregisterDimensionalRange(rangeId)
  })

  it('throws when registering dimensional range twice for same id', async () => {
    const rangeId = 'dim-dup-1'
    registerDimensionalRange<number>(rangeId, {
      initialInput: 1,
      dimensionalRange: baseDim,
      inputToNumber: (x) => x,
      numberToInput: (x) => x,
    })
    await delay(300)
    expect(() =>
      registerDimensionalRange<number>(rangeId, {
        initialInput: 2,
        dimensionalRange: baseDim,
        inputToNumber: (x) => x,
        numberToInput: (x) => x,
      })
    ).toThrow(/already registered/)
    unregisterDimensionalRange(rangeId)
  })

  it('unregisterDimensionalRange throws when range missing', () => {
    expect(() => unregisterDimensionalRange('dim-missing-xyz')).toThrow(
      /not found/
    )
  })

  it('updateDimensionalRangeParams throws when range missing', () => {
    expect(() =>
      updateDimensionalRangeParams('dim-missing-params', baseDim)
    ).toThrow(/not found/)
  })

  it('string-typed dimensional range', async () => {
    const rangeId = 'dim-str-1'
    registerDimensionalRange<string>(rangeId, {
      initialInput: '40',
      dimensionalRange: baseDim,
      inputToNumber: (s) => parseInt(s, 10),
      numberToInput: (n) => String(n),
    })
    await delay(400)
    updateDimensionalRange(rangeId, '42')
    await delay(350)
    expect(accessConversionStore<string>(rangeId).input).toBe('42')
    unregisterDimensionalRange(rangeId)
  })

  it('conflicts with plain registerReadableRange on same id', async () => {
    const rangeId = 'dim-conflict-1'
    await registerReadableRange<number>(
      rangeId,
      1,
      {
        getViewableRange: async (i: number) => [i - 1, i + 1],
        getNextLeftRange: async (i: number) => [i - 5, i - 2],
        getNextRightRange: async (i: number) => [i + 2, i + 5],
        inputToNumber: (x) => x,
        numberToInput: (x) => x,
      },
      false
    )
    expect(() =>
      registerDimensionalRange<number>(rangeId, {
        initialInput: 2,
        dimensionalRange: baseDim,
        inputToNumber: (x) => x,
        numberToInput: (x) => x,
      })
    ).toThrow(/already registered/)
    unregisterReadableRange(rangeId)
  })
})
