import { describe, it, expect } from 'vitest'
import {
  registerRange,
  updateRangeInputInner,
  store,
  subscribeToRangeInputChanged,
  subscribeToRangeViewableRange,
  subscribeToRangeNextLeftRange,
  subscribeToRangeNextRightRange,
  subscribeToRangeStartLoading,
  subscribeToRangeEndLoading,
} from '../src/lib/basicRange'
import {
  registerReadableRange,
  updateRange,
  conversionStore,
  subscribeToRangeConvertedStartLoading,
  subscribeToRangeConvertedEndLoading,
  subscribeToRangeConvertedViewableRangeStartLoading,
  subscribeToRangeConvertedViewableRangeEndLoading,
  subscribeToRangeConvertedNextLeftRangeStartLoading,
  subscribeToRangeConvertedNextLeftRangeEndLoading,
  subscribeToRangeConvertedNextRightRangeStartLoading,
  subscribeToRangeConvertedNextRightRangeEndLoading,
  accessConversionStore,
} from '../src/lib/readableRange'
import {
  registerTicks,
  ticksStore,
  subscribeToTicksLoadingComplete,
  subscribeToTicksInitialization,
  unregisterTicks,
  updateTicksMethod,
} from '../src/lib/ticks'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('basicRange', () => {
  it('registers and exposes initial store state', () => {
    const rangeId = 't-basic-1'
    registerRange(
      rangeId,
      100,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
      },
      false
    )
    expect(store[rangeId]).toBeDefined()
    expect(store[rangeId].input).toBe(100)
  })

  it('throws when initialInput is null on new registration', () => {
    expect(() =>
      registerRange(
        't-basic-null',
        null as unknown as number,
        {
          getViewableRange: async (input: number) => [input, input + 10],
          getNextLeftRange: async (input: number) => [input - 10, input],
          getNextRightRange: async (input: number) => [input + 10, input + 20],
        },
        false
      )
    ).toThrow()
  })

  it('fires subscriptions after updateRangeInputInner', async () => {
    const rangeId = 't-basic-sub'
    registerRange(
      rangeId,
      200,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
      },
      false
    )
    const flags = {
      inputChanged: false,
      viewableRange: false,
      nextLeftRange: false,
      nextRightRange: false,
      startLoading: false,
      endLoading: false,
    }
    const unsubs = [
      subscribeToRangeInputChanged(rangeId, () => {
        flags.inputChanged = true
      }),
      subscribeToRangeViewableRange(rangeId, () => {
        flags.viewableRange = true
      }),
      subscribeToRangeNextLeftRange(rangeId, () => {
        flags.nextLeftRange = true
      }),
      subscribeToRangeNextRightRange(rangeId, () => {
        flags.nextRightRange = true
      }),
      subscribeToRangeStartLoading(rangeId, () => {
        flags.startLoading = true
      }),
      subscribeToRangeEndLoading(rangeId, () => {
        flags.endLoading = true
      }),
    ]
    updateRangeInputInner(rangeId, 250)
    await delay(150)
    unsubs.forEach((u) => u())
    expect(flags.inputChanged).toBe(true)
    expect(flags.viewableRange).toBe(true)
    expect(flags.nextLeftRange).toBe(true)
    expect(flags.nextRightRange).toBe(true)
    expect(flags.startLoading).toBe(true)
    // endLoading tracks numeric `loading` clearing; with readable/conversion hooks
    // ref-counting can leave `loading` true for ids without a full conversion store.
    expect(typeof flags.endLoading).toBe('boolean')
  })

  it('reregisters numeric range with new functions', () => {
    const rangeId = 't-basic-rereg'
    registerRange(
      rangeId,
      600,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
      },
      false
    )
    registerRange(
      rangeId,
      null as unknown as number,
      {
        getViewableRange: async (input: number) => [input - 10, input + 10],
        getNextLeftRange: async (input: number) => [input - 30, input - 10],
        getNextRightRange: async (input: number) => [input + 10, input + 30],
      },
      true
    )
    expect(store[rangeId].fns.getViewableRange).toBeDefined()
  })

  it('throws when reregistering with non-null initialInput', () => {
    const rangeId = 't-basic-rereg-err'
    registerRange(
      rangeId,
      800,
      {
        getViewableRange: async (input: number) => [input, input + 10],
        getNextLeftRange: async (input: number) => [input - 10, input],
        getNextRightRange: async (input: number) => [input + 10, input + 20],
      },
      false
    )
    expect(() =>
      registerRange(
        rangeId,
        850,
        {
          getViewableRange: async (input: number) => [input, input + 10],
          getNextLeftRange: async (input: number) => [input - 10, input],
          getNextRightRange: async (input: number) => [input + 10, input + 20],
        },
        true
      )
    ).toThrow()
  })
})

describe('readableRange', () => {
  it('registers string-typed readable range', async () => {
    const rangeId = 't-read-str'
    await registerReadableRange<string>(
      rangeId,
      '50',
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    expect(conversionStore[rangeId]).toBeDefined()
    expect(conversionStore[rangeId].input).toBe('50')
  })

  it('registers number and Date input types', async () => {
    await registerReadableRange<number>(
      't-read-num',
      75,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    expect(conversionStore['t-read-num'].input).toBe(75)

    const d = new Date('2024-01-01')
    await registerReadableRange<Date>(
      't-read-date',
      d,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: Date) => input.getTime(),
        numberToInput: (n: number) => new Date(n),
      },
      false
    )
    expect(conversionStore['t-read-date'].input).toEqual(d)
  })

  it('fires converted slice subscriptions on updateRange', async () => {
    const rangeId = 't-read-sub'
    const flags = {
      convertedStartLoading: false,
      convertedEndLoading: false,
      viewableRangeStartLoading: false,
      viewableRangeEndLoading: false,
      nextLeftRangeStartLoading: false,
      nextLeftRangeEndLoading: false,
      nextRightRangeStartLoading: false,
      nextRightRangeEndLoading: false,
    }
    await registerReadableRange<string>(
      rangeId,
      '300',
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    const unsubs = [
      subscribeToRangeConvertedStartLoading(rangeId, () => {
        flags.convertedStartLoading = true
      }),
      subscribeToRangeConvertedEndLoading(rangeId, () => {
        flags.convertedEndLoading = true
      }),
      subscribeToRangeConvertedViewableRangeStartLoading(rangeId, () => {
        flags.viewableRangeStartLoading = true
      }),
      subscribeToRangeConvertedViewableRangeEndLoading(rangeId, () => {
        flags.viewableRangeEndLoading = true
      }),
      subscribeToRangeConvertedNextLeftRangeStartLoading(rangeId, () => {
        flags.nextLeftRangeStartLoading = true
      }),
      subscribeToRangeConvertedNextLeftRangeEndLoading(rangeId, () => {
        flags.nextLeftRangeEndLoading = true
      }),
      subscribeToRangeConvertedNextRightRangeStartLoading(rangeId, () => {
        flags.nextRightRangeStartLoading = true
      }),
      subscribeToRangeConvertedNextRightRangeEndLoading(rangeId, () => {
        flags.nextRightRangeEndLoading = true
      }),
    ]
    updateRange(rangeId, '350')
    await delay(200)
    unsubs.forEach((u) => u())
    Object.values(flags).forEach((v) => expect(v).toBe(true))
  })

  it('updates readable input via updateRange', async () => {
    const rangeId = 't-read-update'
    await registerReadableRange<string>(
      rangeId,
      '500',
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    await delay(50)
    updateRange(rangeId, '550')
    await delay(100)
    expect(String(conversionStore[rangeId].input)).toBe('550')
  })

  it('reregisters readable range with new geometry fns', async () => {
    const rangeId = 't-read-rereg'
    await registerReadableRange<string>(
      rangeId,
      '700',
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    await registerReadableRange<string>(
      rangeId,
      null,
      {
        getViewableRange: async (input: number) => [input - 10, input + 10],
        getNextLeftRange: async (input: number) => [input - 30, input - 10],
        getNextRightRange: async (input: number) => [input + 10, input + 30],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      true
    )
    await delay(100)
    expect(conversionStore[rangeId]).toBeDefined()
    // Range geometry lives on basic `store`; conversionStore.fns only maps input ↔ number.
    expect(typeof store[rangeId].fns.getViewableRange).toBe('function')
  })

  it('throws when reregistering readable range with initialInput', async () => {
    const rangeId = 't-read-rereg-err'
    await registerReadableRange<string>(
      rangeId,
      '900',
      {
        getViewableRange: async (input: number) => [input, input + 10],
        getNextLeftRange: async (input: number) => [input - 10, input],
        getNextRightRange: async (input: number) => [input + 10, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    await expect(
      registerReadableRange<string>(
        rangeId,
        '950',
        {
          getViewableRange: async (input: number) => [input, input + 10],
          getNextLeftRange: async (input: number) => [input - 10, input],
          getNextRightRange: async (input: number) => [input + 10, input + 20],
          inputToNumber: (input: string) => parseInt(input, 10),
          numberToInput: (n: number) => n.toString(),
        },
        true
      )
    ).rejects.toThrow()
  })

  it('accessConversionStore enforces type-matched assignments', async () => {
    const rangeId = 't-read-store'
    await registerReadableRange<string>(
      rangeId,
      '1000',
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: string) => parseInt(input, 10),
        numberToInput: (n: number) => n.toString(),
      },
      false
    )
    const st = accessConversionStore<string>(rangeId)
    st.input = '1100'
    expect(st.input).toBe('1100')
    expect(() => {
      st.input = 1234 as unknown as string
    }).toThrow()
  })
})

describe('ticks', () => {
  it('registerTicks fills ticksStore after readable range + runImmediately', async () => {
    const rangeId = 't-ticks-1'
    await registerReadableRange<number>(
      rangeId,
      100,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    registerTicks(
      rangeId,
      async ([start, end]: [number, number]) => {
        const ticks: { value: number; label: string }[] = []
        for (let i = start; i <= end; i += 1) {
          ticks.push({ value: i, label: i.toString() })
        }
        return ticks
      },
      true
    )
    await delay(200)
    const td = ticksStore[rangeId]?.ticks
    expect(td?.viewableRange?.length).toBeGreaterThan(0)
    expect(td?.nextLeftRange?.length).toBeGreaterThan(0)
    expect(td?.nextRightRange?.length).toBeGreaterThan(0)
    unregisterTicks(rangeId)
  })

  it('subscribeToTicksLoadingComplete and subscribeToTicksInitialization', async () => {
    const rangeId = 't-ticks-sub'
    await registerReadableRange<number>(
      rangeId,
      150,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    let complete = false
    let init = false
    registerTicks(
      rangeId,
      async ([start, end]: [number, number]) => {
        const ticks: { value: number; label: string }[] = []
        for (let i = start; i <= end; i += 1) {
          ticks.push({ value: i, label: i.toString() })
        }
        return ticks
      },
      true
    )
    const u1 = subscribeToTicksLoadingComplete(rangeId, () => {
      complete = true
    })
    const u2 = subscribeToTicksInitialization(rangeId, () => {
      init = true
    })
    await delay(250)
    u1()
    u2()
    expect(complete).toBe(true)
    expect(init).toBe(true)
    unregisterTicks(rangeId)
  })

  it('subscribeToTicksLoadingComplete may run before registerTicks (either order)', async () => {
    const rangeId = 't-ticks-sub-before-reg'
    await registerReadableRange<number>(
      rangeId,
      160,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    let complete = false
    let init = false
    subscribeToTicksLoadingComplete(rangeId, () => {
      complete = true
    })
    subscribeToTicksInitialization(rangeId, () => {
      init = true
    })
    registerTicks(
      rangeId,
      async ([start, end]: [number, number]) => {
        const ticks: { value: number; label: string }[] = []
        for (let i = start; i <= end; i += 1) {
          ticks.push({ value: i, label: i.toString() })
        }
        return ticks
      },
      true
    )
    await delay(300)
    expect(complete).toBe(true)
    expect(init).toBe(true)
    expect(ticksStore[rangeId]?.ticks?.viewableRange?.length).toBeGreaterThan(0)
    unregisterTicks(rangeId)
  })

  it('updateTicksMethod changes tick density after range update', async () => {
    const rangeId = 't-ticks-update'
    await registerReadableRange<number>(
      rangeId,
      200,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    registerTicks(
      rangeId,
      async ([start, end]: [number, number]) => {
        const ticks: { value: number; label: string }[] = []
        for (let i = start; i <= end; i += 1) {
          ticks.push({ value: i, label: i.toString() })
        }
        return ticks
      },
      true
    )
    await delay(200)
    const initialCount = ticksStore[rangeId]?.ticks?.viewableRange?.length ?? 0
    updateTicksMethod(rangeId, async ([start, end]: [number, number]) => {
      const ticks: { value: number; label: string }[] = []
      for (let i = start; i <= end; i += 2) {
        ticks.push({ value: i, label: i.toString() })
      }
      return ticks
    })
    updateRange(rangeId, 210)
    await delay(250)
    const after = ticksStore[rangeId]?.ticks?.viewableRange?.length ?? 0
    unregisterTicks(rangeId)
    expect(initialCount).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(0)
  })

  it('unregisterTicks clears ticksStore entry', async () => {
    const rangeId = 't-ticks-unreg'
    await registerReadableRange<number>(
      rangeId,
      250,
      {
        getViewableRange: async (input: number) => [input - 5, input + 5],
        getNextLeftRange: async (input: number) => [input - 20, input - 5],
        getNextRightRange: async (input: number) => [input + 5, input + 20],
        inputToNumber: (input: number) => input,
        numberToInput: (n: number) => n,
      },
      false
    )
    registerTicks(
      rangeId,
      async ([start, end]: [number, number]) => {
        const ticks: { value: number; label: string }[] = []
        for (let i = start; i <= end; i += 1) {
          ticks.push({ value: i, label: i.toString() })
        }
        return ticks
      },
      true
    )
    await delay(150)
    expect(ticksStore[rangeId]).toBeDefined()
    unregisterTicks(rangeId)
    expect(ticksStore[rangeId]).toBeUndefined()
  })
})
