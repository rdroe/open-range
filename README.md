# open-range

Async range tracking for interactive axes and sliders: a **center input**, a **viewable** numeric window, and **prefetch** windows to the left and right. Your async functions define those slices; the library keeps a typed **conversion store** (`string` | `number` | `Date`), and notifies subscribers via **`EventTarget`**. Optional **ticks** load per slice whenever the underlying ranges update.

The main integration surface is **`readableRange`** (typed store + conversion subscriptions) and **`ticks`** (tick lists per slice + loading lifecycle). For zoom/viewport-style axes without hand-written geometry, see **`dimensionalRange`**.

## Install

```bash
npm install open-range
# or
yarn add open-range
```

Subpath imports (`open-range/readableRange`, `open-range/ticks`, etc.) resolve to the same build; use whichever reads best in your project.

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

// 1. Subscribe to “range is ready” before registering (initialization runs after the first load cycle).
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

  // Fires once the first time all tick sets have finished loading.
  subscribeToTicksInitialization(rangeId, (ticks) => {
    console.log('initial tick sets', ticks)
  })
})

// 2. Register the range (async): geometry as functions of numeric input.
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

For numeric axes driven by zoom and viewport width, **`registerDimensionalRange`** (`open-range/dimensionalRange`) can replace hand-written `getViewableRange` / `getNextLeftRange` / `getNextRightRange` (see [Dimensional range](#dimensional-range-convenience)).

---

## Concepts

| Piece | Role |
|--------|------|
| **`rangeId`** | String key for one logical axis / range instance. |
| **Numeric pipeline** | Internally, everything is driven by a **number** (`basicRange`). Your `getViewableRange` / `getNextLeftRange` / `getNextRightRange` take that number. |
| **Conversion store** | **`readableRange`** maps numeric results to your UI type (`StringOrNumberOrDate`) via `inputToNumber` / `numberToInput`. |
| **Loading** | When the input changes, viewable and prefetch ranges reload. **Conversion loading** and **per-slice loading** flags track async work; subscription helpers fire on start/end transitions. |
| **Ticks** | After **`registerTicks`**, tick generation hooks into the readable loading pipeline. **`ticksStore[rangeId]`** holds `viewableRange`, `nextLeftRange`, and `nextRightRange` tick arrays (numeric `value` in the store). |

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
| `registerReadableRange<InputType>(rangeId, initialInput, { getViewableRange, getNextLeftRange, getNextRightRange, inputToNumber, numberToInput }, isReregistration?)` | **Async.** Registers (or re-registers) a readable range. `get*` functions receive **numbers** and return `[start, end]` tuples. First registration requires `initialInput`; re-registration uses `initialInput: null` and keeps the current store input (see tests / implementation). Resolves when initial store and listeners are wired. |
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
| `alignedTickStops(start, end, step, origin?, maxStops?)` | Helper for **phase-stable** ticks: returns numeric stops on the grid **`origin + n·step`** (default **`origin = 0`**) that fall in `[min(start,end), max(start,end)]`. Use inside `createDefaultTicks` so labels do not slide when panning (avoid stepping from `start` with a fixed increment). |
| `updateTicksMethod(rangeId, createDefaultTicks)` | Replaces the tick factory for an existing registration (e.g. change step size). |
| `unregisterTicks(rangeId)` | Removes listeners and clears `ticksStore[rangeId]`. |

### Ticks subscriptions (`ticks`)

| Function | Description |
|----------|-------------|
| `subscribeToTicksLoadingComplete(rangeId, callback)` | **`callback(ticks)`** runs whenever a full ticks loading cycle completes (all pending slice loads for that round have finished). Use for re-rendering axis labels on every pan. Returns **`unsubscribe`**. |
| `subscribeToTicksInitialization(rangeId, callback)` | **`callback(ticks)`** runs **once**, the first time loading completes; the listener is then removed. Use for one-time setup. Returns a cleanup function that removes the listener if it has not fired yet. |

---

### Dimensional range (convenience)

Exported from `open-range/dimensionalRange` (also re-exported from the package root).

```ts
import {
  registerDimensionalRange,
  updateDimensionalRange,
  updateDimensionalRangeParams,
} from 'open-range/dimensionalRange'
import { accessConversionStore } from 'open-range/readableRange'

const rangeId = 'axis'

const dimensionalRange = {
  zoom: 1,
  unitSize: 0.1,
  leftPrefetchFactor: 2,
  rightPrefetchFactor: 2,
  unitsPerViewportWidth: 10,
}

registerDimensionalRange<number>(rangeId, {
  initialInput: 0,
  dimensionalRange,
  inputToNumber: (n) => n,
  numberToInput: (n) => n,
})

// Move the center (same zoom / viewport settings)
updateDimensionalRange(rangeId, 12.5)

// Change zoom or prefetch factors; keeps current input and the same input↔number mappers
updateDimensionalRangeParams(rangeId, {
  ...dimensionalRange,
  zoom: 2,
})

const store = accessConversionStore<number>(rangeId)
console.log(store.viewableRange, store.nextLeftRange, store.nextRightRange)
```

Viewable width is `(unitSize * unitsPerViewportWidth) / zoom`. Left and right prefetch bands extend by `leftPrefetchFactor` and `rightPrefetchFactor` multiples of that width. Use **`subscribeToRangeConvertedEndLoading`** (or **`subscribeToDimensionalRangeConvertedEndLoading`**) if you need to run code after the first async slice load completes.

| Symbol | Description |
|--------|-------------|
| `DimensionalRange` | `{ zoom, unitSize, leftPrefetchFactor, rightPrefetchFactor, unitsPerViewportWidth }`. |
| `registerDimensionalRange(rangeId, { initialInput, dimensionalRange, inputToNumber, numberToInput })` | Registers a readable range using built-in viewport math. Throws if a readable range is already registered for that `rangeId`. |
| `updateDimensionalRange` | Same as `updateRange`. |
| `updateDimensionalRangeParams(rangeId, dimensionalRange)` | Re-registers with new geometry; keeps current input and conversion fns. |
| `unregisterDimensionalRange(rangeId)` | Throws if no dimensional/readable range exists; otherwise calls `unregisterReadableRange`. |
| `subscribeToDimensionalRangeConvertedEndLoading` | Alias for `subscribeToRangeConvertedEndLoading`. |

---

### Basic range (numeric core)

Exported from `open-range/basicRange`. **`registerRange`** / **`store`** / **`emitters`** operate on **numbers** only. Most apps use **`readableRange`**; basic range is the foundation and exposes:

| Function | Description |
|----------|-------------|
| `registerRange`, `updateRangeInputInner`, `unregisterRange` | Numeric registration and updates. |
| `subscribeToRangeInputChanged`, `subscribeToRangeViewableRange`, `subscribeToRangeNextLeftRange`, `subscribeToRangeNextRightRange` | Subscriptions with numeric payloads. |
| `subscribeToRangeStartLoading`, `subscribeToRangeEndLoading` | Basic loading channel on `emitters[rangeId].loading`. |
| `getEventNames2(rangeId)` | Event name strings for basic emitters. |

`readableRange` wires these to `conversionStore` and `conversionEmitters` when you call `registerReadableRange`.

---

## Development & testing

This repo is a **Vite** + **TypeScript** package; `yarn dev` runs the demo app (default port **5173**).

### Demos (local)

| Command / URL | What it is |
|---------------|------------|
| **`yarn dev`** | Dev server at **http://localhost:5173**. **`/`** loads all interactive demos: mock axis (IndexedDB + tick grid + fine pan), **Alphadex**, and **numeric** dimensional examples. The header has **Center input** (default **4**) and **Apply** to push that center through all axes. |
| **`/mock-data-demo.html`** | Mock-only page (link back to home); same default center **4** (no random start). |
| **`/library-harness.html`** | Minimal page wiring **basicRange**, **readableRange**, and **ticks** for quick manual checks (also covered by Playwright). |

Production build entries include `index.html`, `mock-data-demo.html`, and `library-harness.html` (`yarn build:demo`).

### Unit tests & coverage

| Script | Description |
|--------|-------------|
| **`yarn test`** | Run **Vitest** once (`tests/**/*.test.ts`). |
| **`yarn test:watch`** | Vitest watch mode. |
| **`yarn test:coverage`** | Vitest with **v8** coverage for `src/lib/**/*.ts`. Prints a table in the terminal; also writes **`coverage/index.html`** — open that file in a browser for per-file detail. Coverage thresholds (statements/lines) are enforced for the library. |

### End-to-end (Playwright)

| Script | Description |
|--------|-------------|
| **`yarn test:e2e`** | Playwright against the dev server on port **5320** (see `playwright.config.cjs`). |
| **`yarn playwright install chromium`** | One-time browser install if tests fail with a missing-browser error. |
| **`yarn dev:e2e`** | Vite on **5320** — use if you want to hit the same port as Playwright’s `webServer` while debugging. |
| **`yarn test:e2e:ui`** | Playwright UI mode. |
| **`yarn test:e2e:headed`** | Headed browser. |
| **`yarn test:e2e:headed:slow`** | Headed, one worker, **`slowMo`** for easier observation (override with `PLAYWRIGHT_SLOW_MO`). |

---

## License

MIT
