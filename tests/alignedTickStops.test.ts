import { describe, expect, it, vi } from 'vitest'
import { alignedTickStops } from '../src/lib/ticks'

describe('alignedTickStops', () => {
  it('places ticks on origin + n·step (default origin 0)', () => {
    expect(alignedTickStops(1.3, 4.7, 1, 0)).toEqual([2, 3, 4])
    expect(alignedTickStops(0, 10, 2.5, 0)).toEqual([0, 2.5, 5, 7.5, 10])
  })

  it('is stable when the window slides (same multiples in overlap)', () => {
    const a = alignedTickStops(0, 10, 1, 0)
    const b = alignedTickStops(2, 12, 1, 0)
    const overlap = b.filter((x) => x >= 2 && x <= 10)
    expect(overlap).toEqual(a.filter((x) => x >= 2 && x <= 10))
  })

  it('handles reversed start/end', () => {
    expect(alignedTickStops(4, 1, 1, 0)).toEqual([1, 2, 3, 4])
  })

  it('supports non-zero origin', () => {
    expect(alignedTickStops(10, 20, 5, 2.5)).toEqual([12.5, 17.5])
  })

  it('returns empty for invalid step or range', () => {
    expect(alignedTickStops(0, 1, 0, 0)).toEqual([])
    expect(alignedTickStops(NaN, 1, 1, 0)).toEqual([])
  })

  it('returns empty when min/max imply an inverted interval (defensive)', () => {
    const minSpy = vi.spyOn(Math, 'min').mockReturnValueOnce(5)
    const maxSpy = vi.spyOn(Math, 'max').mockReturnValueOnce(3)
    try {
      expect(alignedTickStops(1, 2, 1, 0)).toEqual([])
    } finally {
      minSpy.mockRestore()
      maxSpy.mockRestore()
    }
  })
})
