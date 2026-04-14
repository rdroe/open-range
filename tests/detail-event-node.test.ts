/**
 * Node 18 exposes `Event` / `EventTarget` but not `CustomEvent`. Library internals must
 * still dispatch detail events (same pattern as dedicated Web Workers, which do include
 * `CustomEvent`). This file uses the `node` environment so `CustomEvent` is absent unless
 * the implementation polyfills it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createDetailEvent } from '../src/lib/internal/detailEvent'

describe('createDetailEvent (Node without global CustomEvent)', () => {
  it('dispatches through EventTarget with .detail for listeners', () => {
    const t = new EventTarget()
    const received: unknown[] = []
    t.addEventListener('x', (e) => {
      received.push((e as CustomEvent<{ n: number }>).detail)
    })
    t.dispatchEvent(createDetailEvent('x', { detail: { n: 42 } }))
    expect(received).toEqual([{ n: 42 }])
  })

  it('uses null detail when init is omitted or detail is undefined', () => {
    const seen: unknown[] = []
    const t = new EventTarget()
    t.addEventListener('a', (e) => seen.push((e as CustomEvent<string | null>).detail))
    t.dispatchEvent(createDetailEvent('a'))
    t.dispatchEvent(createDetailEvent('a', { detail: undefined }))
    expect(seen).toEqual([null, null])
  })

  it('preserves falsy but defined detail (e.g. 0)', () => {
    const t = new EventTarget()
    let d: number | undefined
    t.addEventListener('z', (e) => {
      d = (e as CustomEvent<number>).detail
    })
    t.dispatchEvent(createDetailEvent('z', { detail: 0 }))
    expect(d).toBe(0)
  })
})
