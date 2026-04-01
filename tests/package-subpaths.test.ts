import { describe, expect, it } from 'vitest'
import { registerRange, store } from 'open-range/basicRange'
import { registerDimensionalRange } from 'open-range/dimensionalRange'
import { registerReadableRange } from 'open-range/readableRange'
import { registerTicks } from 'open-range/ticks'
import * as root from 'open-range'

/**
 * Ensures package.json `exports` subpaths resolve the same public API as the root entry
 * (Vitest aliases mirror published resolution).
 */
describe('package exports (consumer-style subpaths)', () => {
  it('root barrel re-exports subpath modules', () => {
    expect(root.registerRange).toBe(registerRange)
    expect(root.registerReadableRange).toBe(registerReadableRange)
    expect(root.registerDimensionalRange).toBe(registerDimensionalRange)
    expect(root.registerTicks).toBe(registerTicks)
    expect(root.store).toBe(store)
  })
})
