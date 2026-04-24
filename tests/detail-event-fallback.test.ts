import { afterEach, describe, expect, it, vi } from 'vitest'

describe('createDetailEvent fallback when global CustomEvent is not a function', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('uses DetailEvent class so .detail is delivered (covers internal branch)', async () => {
    const Orig = globalThis.CustomEvent
    // Force the module to load with BuiltinCustomEvent === undefined
    // @ts-expect-error
    delete globalThis.CustomEvent
    const { createDetailEvent } = await import('../src/lib/internal/detailEvent')
    try {
      const t = new EventTarget()
      const details: unknown[] = []
      t.addEventListener('e', (ev) => {
        details.push((ev as CustomEvent<string | null>).detail)
      })
      t.dispatchEvent(createDetailEvent('e', { detail: 'x' }))
      t.dispatchEvent(createDetailEvent('e'))
      expect(details).toEqual(['x', null])
    } finally {
      Object.defineProperty(globalThis, 'CustomEvent', {
        value: Orig,
        configurable: true,
        writable: true,
        enumerable: true,
      })
    }
  })
})
