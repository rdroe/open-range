# open-range

Async range tracking for interactive axes and sliders: a **center input**, a **viewable** numeric window, and **prefetch** windows to the left and right. The library resolves those slices with your async functions, exposes them in a typed **conversion store** (`string` | `number` | `Date` input), and notifies subscribers via **`EventTarget`**. Optional **ticks** load for each slice whenever the underlying ranges update.

The main integration surface is **`readableRange`** (typed store + conversion subscriptions) and **`ticks`** (tick lists per slice + loading lifecycle).

## Install

```bash
npm install open-range
# or
yarn add open-range
```

Subpath imports (`open-range/readableRange`, `open-range/ticks`, etc.) resolve to the same build; use whichever improves readability in your project.

## Example: readable range + ticks

```ts
import {
  registerReadableRange,
  updateRange,
  accessConversionStore,
  subscribeToRangeInitialization,
} from 'open-range/readableRange'
import {
  registerTicks,
  ticksStore,
  subscribeToTicksLoadingComplete,
  subscribeToTicksInitialization,
} from 'open-range/ticks'

const rangeId = 'timeline'

// 1. Subscribe to “range is ready” before registering (initialization runs after first load cycle).
const offInit = subscribeToRangeInitialization(rangeId, () => {
  registerTicks(
    rangeId,
    async ([start, end]) => {
      const out: { value: number; label: string }[] = []
      for (let v = Math.ceil(start); v <= end; v++) out.push({ value: v, label: String(v) })
      return out
    },
    true // fetch ticks immediately for current viewable / prefetch ranges
  )

  subscribeToTicksLoadingComplete(rangeId, (ticks) => {
    console.log('ticks updated', ticks.viewableRange.length, 'in view')
  })

  // Fires once, the first time all tick sets have finished loading.
  subscribeToTicksInitialization(rangeId, (ticks) => {
    console.log('initial tick sets', ticks)
  })
})

// 2. Register the range (async): supply geometry as functions of numeric input.
await registerReadableRange<number>(
  rangeId,
  100,
  {
    getViewableRange: async (input) => [input - 5, input + 5],
    getNextLeftRange: async (input) => [input - 20, input - 5],
    getNextRightRange: async (input) => [input + 5, input + 20],
    inputToNumber: (x) => x,
    numberToInput: (x) => x,
  },
  false
)

// 3. Read the typed store anytime after registration.
const store = accessConversionStore<number>(rangeId)
console.log(store.input, store.viewableRange)

// 4. Pan / change input — slices and ticks refresh asynchronously.
updateRange(rangeId, 120)

// 5. Unsubscribe when tearing down UI.
offInit()
```

For numeric axes with zoom and viewport width, you can use **`registerDimensionalRange`** from `open-range/dimensionalRange` instead of hand-writing `getViewableRange` / `getNextLeftRange` / `getNextRightRange` (see [Dimensional range](#dimensional-range-convenience)).

---

## Concepts

| Piece | Role |
|--------|------|
| **`rangeId`** | String key for one logical axis / range instance. |
| **Numeric pipeline** | Internally, everything is driven by a **number** (`basicRange`). Your `getViewableRange` / `getNextLeftRange` / `getNextRightRange` take that number. |
| **Conversion store** | **`readableRange`** maps numeric results to your UI type (`StringOrNumberOrDate`) via `inputToNumber` / `numberToInput`. |
| **Loading** | When the input changes, viewable and prefetch ranges reload. **Conversion loading** and **per-slice loading** flags track async work; subscription helpers fire on start/end transitions. |
| **Ticks** | After registration, **`registerTicks`** hooks tick generation to the readable loading pipeline. **`ticksStore[rangeId]`** holds `viewableRange`, `nextLeftRange`, and `nextRightRange` tick arrays (numeric `value` in the store). |

---

## API reference

### Types (`readableRange`)

| Name | Description |
|------|-------------|
| `StringOrNumberOrDate` | `string \| number \| Date` — allowed converted input type for a range. |

### Stores (`readableRange`)

| Name | Description |
|------|-------------|
| `conversionStore` | Per-`rangeId` object: `input`, `viewableRange`, `nextLeftRange`, `nextRightRange` (typed endpoints), `converted*Loading` booleans, and `fns` (`inputToNumber`, `numberToInput`). Populated by `registerReadableRange`. |
| `conversionEmitters` | Per-`rangeId` map of `EventTarget` instances for conversion-time events (`inputConverted`, `viewableRangeConverted`, loading targets, etc.) and a `cleanup` list. Prefer the **`subscribeTo…`** helpers below unless you need raw `addEventListener`. |

### Registration & updates (`readableRange`)

| Function | Description |
|----------|-------------|
| `registerReadableRange<InputType>(rangeId, initialInput, { getViewableRange, getNextLeftRange, getNextRightRange, inputToNumber, numberToInput }, isReregistration?)` | **Async.** Registers (or re-registers) a readable range. `get*` functions receive **numbers** and return `[start, end]` tuples. First registration requires `initialInput`; re-registration uses `initialInput: null` and keeps the current store input (see tests / implementation). Returns when initial store and listeners are wired. |
| `updateRange<InputType>(rangeId, input)` | Sets a new **converted** input and triggers the same async refresh chain as a user interaction. |
| `unregisterReadableRange(rangeId)` | Tears down readable listeners and cleanup for that id. |

### Typed accessors (`readableRange`)

| Function | Description |
|----------|-------------|
| `accessConversionStore<InputType>(rangeId)` | Getter/setter facade over `conversionStore[rangeId]` with runtime type checks on assignments (e.g. cannot assign a number to a string-typed range). |

### Event names (`readableRange`)

| Function | Description |
|----------|-------------|
| `getConversionEventNames(rangeId)` | Returns string event names (prefixed with `rangeId`) for use with `conversionEmitters[rangeId].*.addEventListener(...)`. |

### Initialization (`readableRange`)

| Function | Description |
|----------|-------------|
| `subscribeToRangeInitialization(rangeId, callback)` | Registers `callback` to run once the range has finished its initial converted loading cycle (internal hook: runs when the first “converted end loading” fires). Returns **`unsubscribe`**. Subscribe **before** `registerReadableRange` if you need to attach ticks inside the callback. |

### Converted loading — aggregate (`readableRange`)

These listen on the aggregate **`convertedLoading`** channel (overall async work for converted slices).

| Function | Fires when |
|----------|------------|
| `subscribeToRangeConvertedStartLoading(rangeId, callback)` | `loading` becomes `true`. |
| `subscribeToRangeConvertedEndLoading(rangeId, callback)` | `loading` becomes `false`. |

Returns **`unsubscribe`**.

### Converted loading — per slice (`readableRange`)

Each slice has **start** and **end** loading subscriptions (mirroring viewable / next left / next right).

| Function | Fires when |
|----------|------------|
| `subscribeToRangeConvertedViewableRangeStartLoading` | Viewable converted range begins loading. |
| `subscribeToRangeConvertedViewableRangeEndLoading` | Viewable converted range finishes loading. |
| `subscribeToRangeConvertedNextLeftRangeStartLoading` | Next-left begins loading. |
| `subscribeToRangeConvertedNextLeftRangeEndLoading` | Next-left finishes loading. |
| `subscribeToRangeConvertedNextRightRangeStartLoading` | Next-right begins loading. |
| `subscribeToRangeConvertedNextRightRangeEndLoading` | Next-right finishes loading. |

Returns **`unsubscribe`**.

---

### Ticks types (`ticks`)

| Name | Description |
|------|-------------|
| `TicksArray<InputType>` | Array of `{ value: InputType; label: string; dimensions?: { width, height } }`. |

### Ticks store (`ticks`)

| Name | Description |
|------|-------------|
| `ticksStore[rangeId]` | `{ ticks: { viewableRange, nextLeftRange, nextRightRange }, loading: { … } }`. Tick **`value`** fields are **numbers** (aligned with the internal numeric ranges). |

### Ticks registration (`ticks`)

| Function | Description |
|----------|-------------|
| `registerTicks(rangeId, createDefaultTicks, runImmediately?)` | **`createDefaultTicks([start, end])`** returns `Promise<TicksArray<number>>`. When readable conversion loading indicates a slice has updated, the library fetches ticks for that slice’s numeric range. **`runImmediately`** (default `false`): if `true`, runs tick loading once for all three slices right away. Calling `registerTicks` again for the same id **re-registers** (see `unregisterTicks` behavior inside implementation). |
| `updateTicksMethod(rangeId, createDefaultTicks)` | Replaces the tick factory for an existing registration (e.g. change step size). |
| `unregisterTicks(rangeId)` | Removes listeners and clears `ticksStore[rangeId]`. |

### Ticks subscriptions (`ticks`)

| Function | Description |
|----------|-------------|
| `subscribeToTicksLoadingComplete(rangeId, callback)` | **`callback(ticks)`** runs whenever a full ticks loading cycle completes (all pending slice loads for that round have finished). Use for re-rendering axis labels on every pan. Returns **`unsubscribe`**. |
| `subscribeToTicksInitialization(rangeId, callback)` | **`callback(ticks)`** runs **once**, the first time loading completes; the listener is then removed. Use for one-time setup. Returns a cleanup function that removes the listener if it has not fired yet. |

---

### Dimensional range (convenience)

Exported from `open-range/dimensionalRange` (also re-exported from the package root):

| Symbol | Description |
|--------|-------------|
| `DimensionalRange` | `{ zoom, unitSize, leftPrefetchFactor, rightPrefetchFactor, unitsPerViewportWidth }`. |
| `registerDimensionalRange(rangeId, { initialInput, dimensionalRange, inputToNumber, numberToInput })` | Registers a readable range using built-in viewport math (viewable width \(`unitSize * unitsPerViewportWidth / zoom`\), prefetch bands). Throws if already registered. |
| `updateDimensionalRange` | Same as `updateRange`. |
| `updateDimensionalRangeParams(rangeId, dimensionalRange)` | Re-registers with new geometry; keeps current input and conversion fns. |
| `unregisterDimensionalRange(rangeId)` | Delegates to `unregisterReadableRange`. |
| `subscribeToDimensionalRangeConvertedEndLoading` | Alias for `subscribeToRangeConvertedEndLoading`. |

---

### Basic range (numeric core)

Exported from `open-range/basicRange`. **`registerRange`** / **`store`** / **`emitters`** operate on **numbers** only. Typical apps use **`readableRange`** instead; basic range is the foundation and exposes:

| Function | Description |
|----------|-------------|
| `registerRange`, `updateRangeInputInner`, `unregisterRange` | Numeric registration and updates. |
| `subscribeToRangeInputChanged`, `subscribeToRangeViewableRange`, `subscribeToRangeNextLeftRange`, `subscribeToRangeNextRightRange` | Subscriptions with numeric payloads. |
| `subscribeToRangeStartLoading`, `subscribeToRangeEndLoading` | Basic loading channel on `emitters[rangeId].loading`. |
| `getEventNames2(rangeId)` | Event name strings for basic emitters. |

`readableRange` wires these to `conversionStore` and `conversionEmitters` automatically when you call `registerReadableRange`.

---

## License

MIT
