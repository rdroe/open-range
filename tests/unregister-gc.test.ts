import { describe, it, expect } from 'vitest'
import {
  accessConversionStore,
  conversionStore,
  conversionEmitters,
  updateRange,
} from '../src/lib/readableRange'
import { store as basicRangeStore, emitters } from '../src/lib/basicRange'
import {
  registerDimensionalRange,
  unregisterDimensionalRange,
  updateDimensionalRange,
} from '../src/lib/dimensionalRange'
import { registerTicks, unregisterTicks, ticksStore } from '../src/lib/ticks'
import {
  DuplicateRangeIdError,
  RangeNotRegisteredError,
} from '../src/lib/internal/errors'

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

describe('unregister garbage collection (0.4 delete semantics)', () => {
  it('allows a rangeId to be registered again after unregistration', async () => {
    const rangeId = 'gc4-reuse-1'
    register(rangeId, 100)
    await delay(400)
    expect(accessConversionStore<number>(rangeId).input).toBe(100)

    unregisterDimensionalRange(rangeId)

    expect(() => register(rangeId, 200)).not.toThrow()
    await delay(400)
    expect(accessConversionStore<number>(rangeId).input).toBe(200)

    updateDimensionalRange(rangeId, 210)
    await delay(350)
    expect(accessConversionStore<number>(rangeId).input).toBe(210)
    unregisterDimensionalRange(rangeId)
  })

  it('throws RangeNotRegisteredError on reads after unregister', async () => {
    const rangeId = 'gc4-read-1'
    register(rangeId, 50)
    await delay(400)
    unregisterDimensionalRange(rangeId)

    expect(() => accessConversionStore<number>(rangeId).input).toThrow(
      RangeNotRegisteredError
    )
    expect(() => updateRange(rangeId, 999)).toThrow(RangeNotRegisteredError)
  })

  it('an accessor created before unregister throws on later reads, not TypeError', async () => {
    const rangeId = 'gc4-stale-accessor-1'
    register(rangeId, 5)
    await delay(400)
    const accessor = accessConversionStore<number>(rangeId)
    unregisterDimensionalRange(rangeId)

    expect(() => accessor.input).toThrow(RangeNotRegisteredError)
  })

  it('throws DuplicateRangeIdError on a live duplicate registration', async () => {
    const rangeId = 'gc4-dup-1'
    register(rangeId, 1)
    await delay(400)

    expect(() => register(rangeId, 2)).toThrow(DuplicateRangeIdError)
    unregisterDimensionalRange(rangeId)
  })

  it('returns every registry to baseline after register/unregister cycles', async () => {
    const conversionKeys = Object.keys(conversionStore).length
    const conversionEmitterKeys = Object.keys(conversionEmitters).length
    const basicKeys = Object.keys(basicRangeStore).length
    const emitterKeys = Object.keys(emitters).length

    for (let cycle = 0; cycle < 5; cycle++) {
      const rangeId = `gc4-cycle-${cycle}`
      register(rangeId, cycle)
      await delay(400)
      unregisterDimensionalRange(rangeId)
    }

    expect(Object.keys(conversionStore).length).toBe(conversionKeys)
    expect(Object.keys(conversionEmitters).length).toBe(conversionEmitterKeys)
    expect(Object.keys(basicRangeStore).length).toBe(basicKeys)
    expect(Object.keys(emitters).length).toBe(emitterKeys)
  })

  it('unregisterTicks deletes its registry entries and the id is reusable', async () => {
    const rangeId = 'gc4-ticks-1'
    register(rangeId, 10)
    await delay(400)

    const makeTicks = async ([start, end]: [number, number]) => [
      { value: start, label: String(start) },
      { value: end, label: String(end) },
    ]
    registerTicks(rangeId, makeTicks, true)
    await delay(300)
    expect(ticksStore[rangeId]).toBeDefined()

    unregisterTicks(rangeId)
    expect(rangeId in ticksStore).toBe(false)

    registerTicks(rangeId, makeTicks, true)
    await delay(300)
    expect(ticksStore[rangeId].ticks.viewableRange.length).toBeGreaterThan(0)

    unregisterTicks(rangeId)
    unregisterDimensionalRange(rangeId)
  })
})
