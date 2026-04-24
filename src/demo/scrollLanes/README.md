# Scroll lanes demo (`scrollLanes`)

Standalone entry: [`scroll-lanes-demo.html`](../../../scroll-lanes-demo.html) (Vite). This folder holds the swimlane timeline demo that combines **open-range**’s dimensional windows with a scroll-driven viewport and custom layout logic.

## What library pieces this demo uses

| Piece | Role here |
| --- | --- |
| **`registerDimensionalRange`** | Single numeric center input; **three contiguous domain windows** (`viewable`, `nextLeft`, `nextRight`) derived from `DimensionalRange` (prefetch factors + viewport width in domain units). |
| **`updateDimensionalRange` / `updateDimensionalRangeParams`** | **Quantized pan**: when the user scrolls past the “viewable” sector in the scroll box, the center jumps by one full viewable width and the DOM is remapped (see below). Params changes reset scroll like other scroll-box demos. |
| **`registerTicks` + `subscribeToTicksLoadingComplete`** | Async tick lists per window; the demo **waits** on tick completion together with its own async work before finishing a shift. |
| **`subscribeToTicksInitialization`** | First full load of all three tick regions before initial layout. |
| **`subscribeToRangeInitialization`** | First range conversion ready (secondary; primary paint is driven by ticks + lane pack). |
| **`alignedTickStops`** (ticks util) | Grid-aligned tick values for labels, shared with tick registration. |
| **`ticksStore`** | Readout of how many ticks landed in the viewable window after a load. |

Imports use `../../lib/...` because this module lives under `src/demo/scrollLanes/`.

## Architecture (how it fits together)

### 1. Scroll-box contract (see root `STYLEGUIDE.md`)

- The **aperture** is the visible `overflow: auto` panel; **content** is wider and encodes **nextLeft + viewable + nextRight** in pixels.
- **Scroll position is not the center value**: the center updates only when the user **rests** in the left or right prefetch band (debounced `scroll`, not per frame).
- After a **shift**, the implementation does, in one visual update: update the range input, **rebuild** the scene, then set **`scrollLeft` -= shift * viewablePx** so the pixels under the user stay stable (“infinite scroll” feel).

`suppressScroll` avoids treating the programmatic `scrollLeft` write as a new user shift.

### 2. When the center changes, two async concerns complete together

On a sector shift (or param change), the demo must not unlock input until:

1. **Ticks** for the new windows have finished (`subscribeToTicksLoadingComplete` / the `waitAllTicksOnce` pattern).
2. **Lane layout** (or any other heavy work) has finished — here implemented as a microtask/synchronous pack after the range update, but still **joined with** `Promise.all` so the contract is “both gates before paint + scroll compensation”.

That mirrors how a real app might wait for **API + layout** before remapping scroll.

### 3. Domain vs pixels

- **Timeline** span is `[timelineStart, timelineEnd]` = nextLeft.start through nextRight.end (see `STYLEGUIDE.md` window math).
- **X in the content** = linear map from domain to `content` width. Ticks, zone shading, and blocks share the same mapping so labels stay aligned with data.

### 4. Data, persistence, and stability

- **Shape of the data** (where blocks sit in domain *x*, which lane, height, label text) comes from `generateElements.ts`: a **fixed domain grid** and **seeded PRNG** so the same world interval does not jump when the three-window set slides. See [Synthetic data generation](#synthetic-data-generation-not-part-of-the-library) below.
- **Packing** is per swimlane: for each lane, each block gets a **y** = max bottom of all **x-overlapping** earlier blocks (tight stacking), not “row height = max in row”.
- **Who calls the generator:** `rebuildDataAndPack` does not call `generateElementsForRange` directly. It calls **`mockData2`’s** `fetchRange` (see `mockData2Bridge.ts`) for the current `[timelineStart, timelineEnd]`. The store **only generates gaps** in that interval that are not already covered by a persisted **tracked range**; overlapping prior fetches are **reused** and ranges are **merged** as in `src/lib/mockData2/README.md`.
- **Tags** partition the store: `demo: scroll-lanes`, `range: scrollLanesDemo` (same as `RANGE_ID`), and a **browser session** id (shared with other mock demos on this origin). New geometry is still produced by `generateElementsForRange` inside the custom `generateElementsForGap` hook, with each `LaneElement` encoded into `MockRangeElement2.data` for persistence.
- **Storage:** IndexedDB is used when `indexedDB` exists; otherwise in-memory only.

**UI persistence (localStorage).** `scrollLanesUiStorage.ts` saves the five numeric **params**, horizontal **`scrollLeft`**, and integer **`shiftCount`** (so the **domain center** replays as `500 + shiftCount × viewableDomainWidth` on load). `registerDimensionalRange` uses the restored center; the first tick init restores **scroll** clamped to the content width. Changes are written on **debounced scroll** (200ms), after **param apply**, **sector shift**, **mock wipe**, and **first paint**. **Reset layout defaults** (`data-testid="scroll-lanes-reset-layout"`) removes that key, reapplies built-in defaults, centers the range at 500, scrolls to `initialScrollLeft`, and does **not** clear `mockData2` (use the wipe button for that).

### 5. Input: wheel vs pointer drag

- **Wheel** still drives horizontal scroll in JS; `lastWheelTime` marks **wheel-driven** scroll so a **range shift is not deferred** when the user might also be holding the mouse.
- **Pointer down** on the aperture (mouse / touch / pen) **defers** applying a shift until **pointerup** / **pointercancel**, so the remap does not run under an active scrollbar drag or touch pan. On release, pending debounce is cleared and shift logic runs once.
- **Wipe mock session & regenerate** (`data-testid="scroll-lanes-wipe-mock"`) clears the tag-matched `mockData2` store, awaits a full `fetchRange` + pack, then repaints. The aperture is **input-locked** until that finishes, and **horizontal scroll position** is restored afterward (`suppressScroll` + same `scrollLeft`); view settings are re-saved to localStorage.
- **Reset layout defaults** — see **UI persistence** above; separate from mock wipe.

This is demo UX, not the library — but it shows how to **layer** input policies on top of the same `scrollend`-style shift detection.

## Files

| File | Purpose |
| --- | --- |
| `scrollLanesDemo.ts` | `mountScrollLanesDemo`: DOM, range/ticks registration, scroll + wheel + pointer logic, paint, localStorage for UI. |
| `scrollLanesUiStorage.ts` | Load / save / clear `localStorage` for params, `scrollLeft`, and `shiftCount` (`SCROLL_LANES_UI_STORAGE_KEY`). |
| `mockData2Bridge.ts` | `mockData2` store + tags (`demo` / `range` / `session`); gap fill via `generateElementsForRange` with lane fields in `data`; IndexedDB when available. |
| `scrollLanesDemoEntry.ts` | Thin entry for the standalone HTML page. |
| `types.ts` | Lane element, pack result, layout, and mount options types. |
| `constants.ts` | `RANGE_ID`, lane colors, domain grid step, dense lane id. |
| `prng.ts` | Seeded PRNG and tag/height/width helpers for synthetic blocks. |
| `generateElements.ts` | `groupByLane`, `generateElementsForRange` (grid-based data). |
| `packLanes.ts` | `fixPackByLane` (greedy x-overlap vertical packing per lane). |
| `scrollMapping.ts` | Pure domain ↔ content pixel mapping and zone names. |

## For library authors

- **Library** code stays in `src/lib/`; this folder is **demo-only** and may import the library but must not be imported *by* the published package.
- Reuse patterns: **one `rangeId`**, **dimensional** params for “how wide is one view in domain + how much prefetch per side,” **ticks** for axis decoration, and **await** any app-specific data + layout (here: `fetchRange` + pack) before unlocking input and compensating `scrollLeft`, same frame as the style guide recommends.

### Synthetic data generation (not part of the library)

Two pieces work together: **`generateElements.ts`** defines *what* a “block” looks like for any domain subinterval; **`mockData2`** (via `mockData2Bridge.ts`) decides *when* to call that code—only for **gaps** in a simulated fetch—and **persists** the result under tags. Neither layer uses `open-range` for data; they sit beside it so the swimlanes have **stable** geometry across pans and page reloads (when IndexedDB is available).

**Pipeline.** On each `rebuildDataAndPack`, the demo `await`s `fetchRange(tags, { start: t0, end: t1 })` for the current full three-window span `[t0, t1]` = nextLeft through nextRight. `mockData2` compares that request to **tracked** `[lo, hi]` chunks; for each **gap** it calls the configured **`generateElementsForGap`**, which here runs `generateElementsForRange(gap0, gap1)` and maps each `LaneElement` to `{ start, end, data }` (lane id, `id`, `tag3`, `height` in `data`). Returned rows are merged into the store, then **mapped back** to `LaneElement` for `groupByLane` and packing.

**Grid anchoring** (`generateElements.ts`). The axis is split into fixed-width cells of length `DOMAIN_GRID_STEP` (see `constants.ts`). For any **gap** `[g0, g1]` passed in from `mockData2`, the code walks cell indices from `floor(g0 / step)` to `ceil(g1 / step)`. Everything inside a cell is keyed by `(g, lane, k)`, so a given “world” coordinate always uses the same pseudo-random draw for that slot.

**Deterministic PRNG** (`prng.ts`). A **mulberry32** stream is seeded with `cellKeySeed(g, lane, k)` (and fixed secondary indices for chord-style extras). The same tuple always yields the same placement, width, and height draw: when a **gap** is (re)filled, the output matches what you would have gotten for that interval in a single monolithic `generateElementsForRange` for the same bounds—*assuming* the gap list matches. After **merge** of tracked ranges, previously stored elements are **not** regenerated; only new gap segments run the generator.

**Per-lane candidates.** For each cell that intersects the range, the generator iterates all five `laneId` values. Non-dense lanes use a few candidate indices `k` with a **high skip** rate; `DENSE_LANE` has more `k` and a **low skip** rate, plus different width/placement rules. **Height** and a three-character **tag** for labels use `blockHeightForSeed` / `makeTag3`; width uses `widthScale2to5(s0)`.

**Chords (second pass).** A separate loop can add a larger “chord” bar in the dense lane (fixed `k` slots, e.g. 90/91) for silhouette variety; same grid/seed idea.

**Wipe.** The demo calls `bumpScrollLanesDataEpoch()` then `clearForTags` so the next `fetchRange` not only refills from empty storage but also mixes a new **epoch** into `cellKeySeed`—otherwise the same deterministic grid would reproduce identical blocks for the same domain span. The **dimensional** center and tick subscription are unchanged.

**Takeaway for app authors:** Real data should be keyed by **domain identity or a stable server id** so the viewport can slide without reshuffling. Here, **grid + PRNG** gives deterministic *generation*, and **mockData2** gives *fetch + merge* semantics similar to a client cache. `open-range` only exposes the **current windows in domain space**; how you keep pixels stable and what you persist is your layer.
