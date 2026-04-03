import { describe, it, expect, vi } from 'vitest'
import {
  emitters,
  getEventNames2,
  registerRange,
  store,
  updateRangeInputInner,
  subscribeToRangeNextLeftRange,
  subscribeToRangeNextRightRange,
  subscribeToRangeStartLoading,
  subscribeToRangeEndLoading,
  subscribeToRangeInputChanged,
  subscribeToRangeViewableRange,
  unregisterRange,
} from '../src/lib/basicRange'
import {
  accessConversionStore,
  conversionEmitters,
  conversionStore,
  registerReadableRange,
  unregisterReadableRange,
  updateRange,
  getConversionEventNames,
  subscribeToRangeInitialization,
  subscribeToRangeConvertedStartLoading,
  subscribeToRangeConvertedEndLoading,
  subscribeToRangeConvertedViewableRangeStartLoading,
  subscribeToRangeConvertedViewableRangeEndLoading,
  subscribeToRangeConvertedNextLeftRangeStartLoading,
  subscribeToRangeConvertedNextLeftRangeEndLoading,
  subscribeToRangeConvertedNextRightRangeStartLoading,
  subscribeToRangeConvertedNextRightRangeEndLoading,
} from '../src/lib/readableRange'
import {
  registerTicks,
  unregisterTicks,
  ticksStore,
} from '../src/lib/ticks'

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

describe('basicRange extra API', () => {
  it('subscribeToRangeStartLoading throws on invalid loading event detail', () => {
    const rangeId = 'cov-basic-load-invalid-a'
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeStartLoading(rangeId, () => {})
    expect(() =>
      emitters[rangeId].loading.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).loading, {
          detail: { rangeId: '' },
        })
      )
    ).toThrow(/Invalid event detail/)
  })

  it('subscribeToRangeEndLoading throws on invalid loading event detail', () => {
    const rangeId = 'cov-basic-load-invalid-b'
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeEndLoading(rangeId, () => {})
    expect(() =>
      emitters[rangeId].loading.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).loading, {
          detail: { rangeId: '' },
        })
      )
    ).toThrow(/Invalid event detail/)
  })

  it('subscribeToRangeEndLoading cleanup runs via unregisterRange', () => {
    const rangeId = 'cov-basic-unreg-load'
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeEndLoading(rangeId, () => {})
    unregisterRange(rangeId)
  })

  it('subscribeToRangeStartLoading cleanup runs via unregisterRange', () => {
    const rangeId = 'cov-basic-unreg-start'
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeStartLoading(rangeId, () => {})
    unregisterRange(rangeId)
  })

  it('internalInputChangedListener and inputAfterChangedListener reject invalid detail', () => {
    const rangeId = 'cov-basic-invalid-detail'
    registerRange(rangeId, 100, geo, false)
    expect(() =>
      emitters[rangeId].inputChanged.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).inputChanged, {
          detail: { rangeId, input: undefined as unknown as number },
        })
      )
    ).toThrow(/Invalid event detail/)
    expect(() =>
      emitters[rangeId].inputChanged.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).inputAfterChanged, {
          detail: { rangeId: '' },
        })
      )
    ).toThrow(/Invalid event detail/)
  })

  it('registerRange returns early when range id already registered', () => {
    const rangeId = 'cov-basic-dup-reg'
    registerRange(rangeId, 100, geo, false)
    registerRange(rangeId, 999, geo, false)
    expect(store[rangeId].input).toBe(100)
  })

  it('subscribeToRangeViewableRange cleanup and explicit unsubscribe', async () => {
    const rangeId = 'cov-basic-vr-unsub'
    registerRange(rangeId, 100, geo, false)
    const seen: number[] = []
    const u = subscribeToRangeViewableRange(rangeId, ([a]) => seen.push(a))
    updateRangeInputInner(rangeId, 200)
    await delay(250)
    expect(seen.length).toBeGreaterThan(0)
    u()
    const unsubInput = subscribeToRangeInputChanged(rangeId, () => {})
    unsubInput()
    unregisterRange(rangeId)
  })

  it('subscribeToRangeNextLeftRange / NextRightRange receive slices; unregisterRange removes listeners', async () => {
    const rangeId = 'cov-basic-nl-nr'
    const left: [number, number][] = []
    const right: [number, number][] = []
    registerRange(rangeId, 100, geo, false)
    const uL = subscribeToRangeNextLeftRange(rangeId, (r) => left.push(r))
    const uR = subscribeToRangeNextRightRange(rangeId, (r) => right.push(r))
    updateRangeInputInner(rangeId, 110)
    await delay(300)
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
    uL()
    uR()
    unregisterRange(rangeId)
    expect(store[rangeId]).toBeDefined()
  })
})

describe('registerReadableRange validation and idempotency', () => {
  it('throws when initialInput is null on new registration', async () => {
    await expect(
      registerReadableRange<number>(
        'cov-read-null-new',
        null,
        { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
        false
      )
    ).rejects.toThrow(/Initial input required/)
  })

  it('throws when inputToNumber does not yield a number on first registration', async () => {
    const rangeId = 'cov-read-bad-num'
    await expect(
      registerReadableRange<number>(
        rangeId,
        100,
        {
          ...geo,
          inputToNumber: () => 'not-a-number' as unknown as number,
          numberToInput: (n) => n,
        },
        false
      )
    ).rejects.toThrow(/Initial input must be a  number/)
  })

  it('second registerReadableRange for the same id returns early (conversion already wired)', async () => {
    const rangeId = 'cov-read-dup-reg'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    await registerReadableRange<number>(
      rangeId,
      999,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(conversionStore[rangeId]?.input).toBe(100)
    unregisterReadableRange(rangeId)
  })

  it('throws when reregistering with null initialInput and store input is null', async () => {
    const rangeId = 'cov-read-rereg-null-in'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    conversionStore[rangeId].input = null as unknown as number
    await expect(
      registerReadableRange<number>(
        rangeId,
        null,
        { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
        true
      )
    ).rejects.toThrow(/Cannot re-register/)
    unregisterReadableRange(rangeId)
  })
})

describe('readableRange subscription surface', () => {
  it('converted loading and slice loading subscribers fire; unsubscribe works', async () => {
    const rangeId = 'cov-read-subs'
    await registerReadableRange<number>(
      rangeId,
      100,
      {
        ...geo,
        inputToNumber: (n) => n,
        numberToInput: (n) => n,
      },
      false
    )
    let startL = 0
    let endL = 0
    let vStart = 0
    let vEnd = 0
    let nlStart = 0
    let nlEnd = 0
    let nrStart = 0
    let nrEnd = 0
    const u1 = subscribeToRangeConvertedStartLoading(rangeId, () => {
      startL++
    })
    const u2 = subscribeToRangeConvertedEndLoading(rangeId, () => {
      endL++
    })
    const u3 = subscribeToRangeConvertedViewableRangeStartLoading(
      rangeId,
      () => {
        vStart++
      }
    )
    const u4 = subscribeToRangeConvertedViewableRangeEndLoading(rangeId, () => {
      vEnd++
    })
    const u5 = subscribeToRangeConvertedNextLeftRangeStartLoading(
      rangeId,
      () => {
        nlStart++
      }
    )
    const u6 = subscribeToRangeConvertedNextLeftRangeEndLoading(rangeId, () => {
      nlEnd++
    })
    const u7 = subscribeToRangeConvertedNextRightRangeStartLoading(
      rangeId,
      () => {
        nrStart++
      }
    )
    const u8 = subscribeToRangeConvertedNextRightRangeEndLoading(rangeId, () => {
      nrEnd++
    })
    updateRange(rangeId, 120)
    await delay(450)
    expect(endL).toBeGreaterThan(0)
    expect(vEnd).toBeGreaterThan(0)
    expect(nlEnd).toBeGreaterThan(0)
    expect(nrEnd).toBeGreaterThan(0)
    u1()
    u2()
    u3()
    u4()
    u5()
    u6()
    u7()
    u8()
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeInitialization runs once when registered before readable range', async () => {
    const rangeId = 'cov-read-init'
    let inits = 0
    subscribeToRangeInitialization(rangeId, () => {
      inits++
    })
    await registerReadableRange<number>(
      rangeId,
      77,
      {
        ...geo,
        inputToNumber: (n) => n,
        numberToInput: (n) => n,
      },
      false
    )
    await delay(500)
    expect(inits).toBe(1)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeInitialization unsubscribe removes the listener', async () => {
    const rangeId = 'cov-read-init-unsub'
    const u = subscribeToRangeInitialization(rangeId, () => {})
    await registerReadableRange<number>(
      rangeId,
      50,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    await delay(200)
    u()
    unregisterReadableRange(rangeId)
  })
})

describe('ticks edge paths', () => {
  it('registerTicks overwrites prior registration', async () => {
    const rangeId = 'cov-ticks-re'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    registerTicks(
      rangeId,
      async () => [{ value: 1, label: 'a' }],
      true
    )
    await delay(200)
    registerTicks(
      rangeId,
      async () => [{ value: 2, label: 'b' }],
      true
    )
    await delay(250)
    expect(ticksStore[rangeId]?.ticks?.viewableRange?.length).toBeGreaterThan(0)
    unregisterTicks(rangeId)
    unregisterReadableRange(rangeId)
  })

  it('rejected createDefaultTicks hits catch path', async () => {
    const rangeId = 'cov-ticks-reject'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    registerTicks(
      rangeId,
      async () => {
        throw new Error('tick fail')
      },
      true
    )
    await delay(300)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    unregisterTicks(rangeId)
    unregisterReadableRange(rangeId)
  })
})

describe('readableRange invalid event detail guards', () => {
  it('converted loading / viewable / next-slice start subscribers throw on incomplete detail', async () => {
    const rangeId = 'cov-read-start-bad'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    subscribeToRangeConvertedStartLoading(rangeId, () => {})
    subscribeToRangeConvertedViewableRangeStartLoading(rangeId, () => {})
    subscribeToRangeConvertedNextLeftRangeStartLoading(rangeId, () => {})
    subscribeToRangeConvertedNextRightRangeStartLoading(rangeId, () => {})
    expect(() =>
      conversionEmitters[rangeId].convertedLoading.dispatchEvent(
        new CustomEvent(names.convertedLoading, { detail: { rangeId } })
      )
    ).toThrow(/Invalid event detail/)
    expect(() =>
      conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedViewableRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    expect(() =>
      conversionEmitters[rangeId].convertedNextLeftRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedNextLeftRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    expect(() =>
      conversionEmitters[rangeId].convertedNextRightRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedNextRightRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeConvertedViewableRangeEndLoading throws when detail omits flags', async () => {
    const rangeId = 'cov-read-vr-end-bad'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    subscribeToRangeConvertedViewableRangeEndLoading(rangeId, () => {})
    const names = getConversionEventNames(rangeId)
    expect(() =>
      conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedViewableRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeConvertedEndLoading throws when loading flag missing', async () => {
    const rangeId = 'cov-read-ce-bad'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    subscribeToRangeConvertedEndLoading(rangeId, () => {})
    const names = getConversionEventNames(rangeId)
    expect(() =>
      conversionEmitters[rangeId].convertedLoading.dispatchEvent(
        new CustomEvent(names.convertedLoading, { detail: { rangeId } })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeConvertedNextLeftRangeEndLoading throws when detail omits flags', async () => {
    const rangeId = 'cov-read-nl-bad'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    subscribeToRangeConvertedNextLeftRangeEndLoading(rangeId, () => {})
    const names = getConversionEventNames(rangeId)
    expect(() =>
      conversionEmitters[rangeId].convertedNextLeftRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedNextLeftRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeConvertedNextRightRangeEndLoading throws when detail omits flags', async () => {
    const rangeId = 'cov-read-nr-bad'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    subscribeToRangeConvertedNextRightRangeEndLoading(rangeId, () => {})
    const names = getConversionEventNames(rangeId)
    expect(() =>
      conversionEmitters[rangeId].convertedNextRightRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedNextRightRangeLoading, {
          detail: { rangeId },
        } as CustomEventInit)
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })
})

describe('basicRange loading false when async slices finish in different orders', () => {
  function deferredGeo() {
    let resV!: (v: [number, number]) => void
    let resL!: (v: [number, number]) => void
    let resR!: (v: [number, number]) => void
    const pV = new Promise<[number, number]>((r) => {
      resV = r
    })
    const pL = new Promise<[number, number]>((r) => {
      resL = r
    })
    const pR = new Promise<[number, number]>((r) => {
      resR = r
    })
    return {
      geo: {
        getViewableRange: () => pV,
        getNextLeftRange: () => pL,
        getNextRightRange: () => pR,
      },
      resV,
      resL,
      resR,
    }
  }

  it('dispatches loading false when viewableRange resolves last', async () => {
    const rangeId = 'cov-basic-load-order-v'
    const { geo, resV, resL, resR } = deferredGeo()
    let endLoads = 0
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeEndLoading(rangeId, () => {
      endLoads++
    })
    updateRangeInputInner(rangeId, 200)
    resL([80, 95])
    resR([205, 220])
    await Promise.resolve()
    resV([195, 205])
    await delay(80)
    expect(endLoads).toBe(1)
    unregisterRange(rangeId)
  })

  it('dispatches loading false when nextLeftRange resolves last', async () => {
    const rangeId = 'cov-basic-load-order-l'
    const { geo, resV, resL, resR } = deferredGeo()
    let endLoads = 0
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeEndLoading(rangeId, () => {
      endLoads++
    })
    updateRangeInputInner(rangeId, 200)
    resV([195, 205])
    resR([205, 220])
    await Promise.resolve()
    resL([80, 95])
    await delay(80)
    expect(endLoads).toBe(1)
    unregisterRange(rangeId)
  })

  it('dispatches loading false when nextRightRange resolves last', async () => {
    const rangeId = 'cov-basic-load-order-r'
    const { geo, resV, resL, resR } = deferredGeo()
    let endLoads = 0
    registerRange(rangeId, 100, geo, false)
    subscribeToRangeEndLoading(rangeId, () => {
      endLoads++
    })
    updateRangeInputInner(rangeId, 200)
    resV([195, 205])
    resL([80, 95])
    await Promise.resolve()
    resR([205, 220])
    await delay(80)
    expect(endLoads).toBe(1)
    unregisterRange(rangeId)
  })
})

describe('readableRange conversion subscribers — valid detail callbacks', () => {
  it('fires end/start loading callbacks when flags match', async () => {
    const rangeId = 'cov-read-cb-flags'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    let vrEnd = 0
    let nlStart = 0
    let nrStart = 0
    let nlEnd = 0
    let nrEnd = 0
    subscribeToRangeConvertedViewableRangeEndLoading(rangeId, () => {
      vrEnd++
    })
    subscribeToRangeConvertedNextLeftRangeStartLoading(rangeId, () => {
      nlStart++
    })
    subscribeToRangeConvertedNextRightRangeStartLoading(rangeId, () => {
      nrStart++
    })
    subscribeToRangeConvertedNextLeftRangeEndLoading(rangeId, () => {
      nlEnd++
    })
    subscribeToRangeConvertedNextRightRangeEndLoading(rangeId, () => {
      nrEnd++
    })

    conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedViewableRangeLoading, {
        detail: { rangeId, viewableRangeLoading: false },
      })
    )
    conversionEmitters[rangeId].convertedNextLeftRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextLeftRangeLoading, {
        detail: { rangeId, nextLeftRangeLoading: true },
      })
    )
    conversionEmitters[rangeId].convertedNextRightRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextRightRangeLoading, {
        detail: { rangeId, nextRightRangeLoading: true },
      })
    )
    conversionEmitters[rangeId].convertedNextLeftRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextLeftRangeLoading, {
        detail: { rangeId, nextLeftRangeLoading: false },
      })
    )
    conversionEmitters[rangeId].convertedNextRightRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextRightRangeLoading, {
        detail: { rangeId, nextRightRangeLoading: false },
      })
    )

    expect(vrEnd).toBe(1)
    expect(nlStart).toBe(1)
    expect(nrStart).toBe(1)
    expect(nlEnd).toBe(1)
    expect(nrEnd).toBe(1)
    unregisterReadableRange(rangeId)
  })

  it('subscribeToRangeConvertedViewableRangeEndLoading throws when rangeId missing', async () => {
    const rangeId = 'cov-read-vr-end-throw'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    subscribeToRangeConvertedViewableRangeEndLoading(rangeId, () => {})
    expect(() =>
      conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
        new CustomEvent(names.convertedViewableRangeLoading, {
          detail: { rangeId: '', viewableRangeLoading: false },
        })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })
})

describe('convertUpdated slice loading handlers clear convertedLoading', () => {
  it('viewable loading false clears convertedLoading when no slice prefetch is loading', async () => {
    const rangeId = 'cov-vr-clear'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    accessConversionStore<number>(rangeId).convertedLoading = true
    accessConversionStore<number>(rangeId).convertedNextLeftRangeLoading = false
    accessConversionStore<number>(rangeId).convertedNextRightRangeLoading = false
    let endLoads = 0
    subscribeToRangeConvertedEndLoading(rangeId, () => {
      endLoads++
    })
    conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedViewableRangeLoading, {
        detail: { rangeId, viewableRangeLoading: false },
      })
    )
    expect(endLoads).toBe(1)
    expect(accessConversionStore<number>(rangeId).convertedLoading).toBe(false)
    unregisterReadableRange(rangeId)
  })

  it('viewable loading false returns early when convertedLoading is already false', async () => {
    const rangeId = 'cov-vr-short'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    accessConversionStore<number>(rangeId).convertedLoading = false
    let endLoads = 0
    subscribeToRangeConvertedEndLoading(rangeId, () => {
      endLoads++
    })
    conversionEmitters[rangeId].convertedViewableRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedViewableRangeLoading, {
        detail: { rangeId, viewableRangeLoading: false },
      })
    )
    expect(endLoads).toBe(0)
    unregisterReadableRange(rangeId)
  })

  it('nextLeft loading false clears convertedLoading when no other slice is loading', async () => {
    const rangeId = 'cov-nl-clear'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    accessConversionStore<number>(rangeId).convertedLoading = true
    accessConversionStore<number>(rangeId).convertedViewableRangeLoading = false
    accessConversionStore<number>(rangeId).convertedNextRightRangeLoading = false
    let endLoads = 0
    subscribeToRangeConvertedEndLoading(rangeId, () => {
      endLoads++
    })
    conversionEmitters[rangeId].convertedNextLeftRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextLeftRangeLoading, {
        detail: { rangeId, nextLeftRangeLoading: false },
      })
    )
    expect(endLoads).toBe(1)
    expect(accessConversionStore<number>(rangeId).convertedLoading).toBe(false)
    unregisterReadableRange(rangeId)
  })

  it('nextRight loading false clears convertedLoading when no other slice is loading', async () => {
    const rangeId = 'cov-nr-clear'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    const names = getConversionEventNames(rangeId)
    accessConversionStore<number>(rangeId).convertedLoading = true
    accessConversionStore<number>(rangeId).convertedViewableRangeLoading = false
    accessConversionStore<number>(rangeId).convertedNextLeftRangeLoading = false
    let endLoads = 0
    subscribeToRangeConvertedEndLoading(rangeId, () => {
      endLoads++
    })
    conversionEmitters[rangeId].convertedNextRightRangeLoading.dispatchEvent(
      new CustomEvent(names.convertedNextRightRangeLoading, {
        detail: { rangeId, nextRightRangeLoading: false },
      })
    )
    expect(endLoads).toBe(1)
    expect(accessConversionStore<number>(rangeId).convertedLoading).toBe(false)
    unregisterReadableRange(rangeId)
  })
})

describe('accessConversionStore setters', () => {
  it('throws Input type mismatch when assigning an incompatible input', async () => {
    const rangeId = 'cov-acc-type'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(() => {
      accessConversionStore<number>(rangeId).input = 'bad' as unknown as number
    }).toThrow(/Input type mismatch/)
    unregisterReadableRange(rangeId)
  })
})

describe('readableRange internal convert handlers reject bad basic emitters', () => {
  it('throws when viewableRange event omits slice tuple', async () => {
    const rangeId = 'cov-read-emit-vr'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(() =>
      emitters[rangeId].viewableRange.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).viewableRange, {
          detail: {
            rangeId,
            viewableRange: undefined as unknown as [number, number],
          },
        })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('throws when nextLeftRange event omits slice tuple', async () => {
    const rangeId = 'cov-read-emit-nl'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(() =>
      emitters[rangeId].nextLeftRange.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).nextLeftRange, {
          detail: {
            rangeId,
            nextLeftRange: undefined as unknown as [number, number],
          },
        })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('throws when nextRightRange event omits slice tuple', async () => {
    const rangeId = 'cov-read-emit-nr'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(() =>
      emitters[rangeId].nextRightRange.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).nextRightRange, {
          detail: {
            rangeId,
            nextRightRange: undefined as unknown as [number, number],
          },
        })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })

  it('throws when inputChanged event omits input', async () => {
    const rangeId = 'cov-read-emit-in'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    expect(() =>
      emitters[rangeId].inputChanged.dispatchEvent(
        new CustomEvent(getEventNames2(rangeId).inputChanged, {
          detail: { rangeId, input: undefined as unknown as number },
        })
      )
    ).toThrow(/Invalid event detail/)
    unregisterReadableRange(rangeId)
  })
})

describe('ticks missing basic slice', () => {
  it('throws when viewableRange is missing and runImmediately runs tick loaders', async () => {
    const rangeId = 'cov-ticks-missing-slice'
    await registerReadableRange<number>(
      rangeId,
      100,
      { ...geo, inputToNumber: (n) => n, numberToInput: (n) => n },
      false
    )
    store[rangeId].viewableRange = undefined as unknown as [number, number]
    try {
      expect(() =>
        registerTicks(rangeId, async () => [{ value: 0, label: '0' }], true)
      ).toThrow(/viewableRange not found/)
    } finally {
      try {
        unregisterTicks(rangeId)
      } catch {
        /* partial registration */
      }
      unregisterReadableRange(rangeId)
    }
  })
})

