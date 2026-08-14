import { describe, it, expect, vi } from 'vitest'
import {
  accessConversionStore,
  conversionStore,
  isRangeDisposed,
  updateRange,
} from '../src/lib/readableRange'
import { store as basicRangeStore } from '../src/lib/basicRange'
import {
  registerDimensionalRange,
  unregisterDimensionalRange,
  updateDimensionalRange,
} from '../src/lib/dimensionalRange'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const baseDim = {
  zoom: 2,
  unitSize: 0.1,
  leftPrefetchFactor: 1,
  rightPrefetchFactor: 1,
  unitsPerViewportWidth: 10,
}

const register = (rangeId: string, initialInput = 100) =>
  registerDimensionalRange<number>(rangeId, {
    initialInput,
    dimensionalRange: baseDim,
    inputToNumber: (n) => n,
    numberToInput: (n) => n,
  })

describe('unregister garbage collection (0.3.9 tombstone semantics)', () => {
  it('allows a rangeId to be registered again after unregistration', async () => {
    const rangeId = 'gc-reuse-1'
    register(rangeId, 100)
    await delay(400)
    expect(accessConversionStore<number>(rangeId).input).toBe(100)

    unregisterDimensionalRange(rangeId)
    expect(isRangeDisposed(rangeId)).toBe(true)

    // Previously threw "already registered" forever for the session.
    expect(() => register(rangeId, 200)).not.toThrow()
    await delay(400)
    expect(accessConversionStore<number>(rangeId).input).toBe(200)
    expect(isRangeDisposed(rangeId)).toBe(false)

    updateDimensionalRange(rangeId, 210)
    await delay(350)
    expect(accessConversionStore<number>(rangeId).input).toBe(210)
    unregisterDimensionalRange(rangeId)
  })

  it('keeps last-known values readable after unregister, with a one-time warning', async () => {
    const rangeId = 'gc-tombstone-1'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      register(rangeId, 50)
      await delay(400)
      unregisterDimensionalRange(rangeId)

      expect(accessConversionStore<number>(rangeId).input).toBe(50)
      accessConversionStore<number>(rangeId)
      const disposalWarnings = warn.mock.calls.filter(([message]) =>
        String(message).includes(rangeId)
      )
      expect(disposalWarnings).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('stops converting after unregister — the handlers really detach', async () => {
    const rangeId = 'gc-detach-1'
    register(rangeId, 10)
    await delay(400)
    unregisterDimensionalRange(rangeId)

    // Drive the underlying numeric store directly; a still-attached conversion
    // handler would copy the new input into the conversion store.
    updateRange(rangeId, 999)
    await delay(300)
    expect(accessConversionStore<number>(rangeId).input).toBe(10)
  })

  it('does not grow the registries when a reused id cycles register/unregister', async () => {
    const rangeId = 'gc-cycle-1'
    register(rangeId, 1)
    await delay(400)
    unregisterDimensionalRange(rangeId)

    const conversionKeys = Object.keys(conversionStore).length
    const basicKeys = Object.keys(basicRangeStore).length

    for (let cycle = 0; cycle < 5; cycle++) {
      register(rangeId, cycle)
      await delay(400)
      unregisterDimensionalRange(rangeId)
    }

    expect(Object.keys(conversionStore).length).toBe(conversionKeys)
    expect(Object.keys(basicRangeStore).length).toBe(basicKeys)
  })
})
