/**
 * Full basicRange path without browser `CustomEvent` (Node 18-style globals).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
import {
  emitters,
  getEventNames2,
  registerRange,
  store,
  updateRangeInputInner,
} from '../src/lib/basicRange'

const geo = {
  getViewableRange: async (input: number): Promise<[number, number]> => [
    input - 1,
    input + 1,
  ],
  getNextLeftRange: async (input: number): Promise<[number, number]> => [
    input - 10,
    input - 2,
  ],
  getNextRightRange: async (input: number): Promise<[number, number]> => [
    input + 2,
    input + 10,
  ],
}

describe('basicRange in Node (EventTarget + detail events)', () => {
  it('viewableRange updates propagate via CustomEvent-shaped detail', async () => {
    const rangeId = 'node-br-1'
    const log: [number, number][] = []
    registerRange(rangeId, 100, geo, false)
    emitters[rangeId].viewableRange.addEventListener(
      getEventNames2(rangeId).viewableRange,
      (e: Event) => {
        const ce = e as CustomEvent<{ viewableRange: [number, number] }>
        log.push(ce.detail.viewableRange)
      }
    )
    updateRangeInputInner(rangeId, 50)
    await delay(300)
    expect(store[rangeId].viewableRange).toEqual([49, 51])
    expect(log[log.length - 1]).toEqual([49, 51])
  })
})
