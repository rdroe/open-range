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

### 4. Data and stability

- Synthetic **blocks** are generated on a **fixed domain grid** so the same world interval does not jump when the three-window set slides (no per-shift random reseed of the same coordinates).
- **Packing** is per swimlane: for each lane, each block gets a **y** = max bottom of all **x-overlapping** earlier blocks (tight stacking), not “row height = max in row”.

### 5. Input: wheel vs pointer drag

- **Wheel** still drives horizontal scroll in JS; `lastWheelTime` marks **wheel-driven** scroll so a **range shift is not deferred** when the user might also be holding the mouse.
- **Pointer down** on the aperture (mouse / touch / pen) **defers** applying a shift until **pointerup** / **pointercancel**, so the remap does not run under an active scrollbar drag or touch pan. On release, pending debounce is cleared and shift logic runs once.

This is demo UX, not the library — but it shows how to **layer** input policies on top of the same `scrollend`-style shift detection.

## Files

| File | Purpose |
| --- | --- |
| `scrollLanesDemo.ts` | `mountScrollLanesDemo`: DOM, range/ticks registration, scroll + wheel + pointer logic, paint. |
| `scrollLanesDemoEntry.ts` | Thin entry for the standalone HTML page. |
| `types.ts` | Lane element, pack result, layout, and mount options types. |
| `constants.ts` | `RANGE_ID`, lane colors, domain grid step, dense lane id. |
| `prng.ts` | Seeded PRNG and tag/height/width helpers for synthetic blocks. |
| `generateElements.ts` | `groupByLane`, `generateElementsForRange` (grid-based data). |
| `packLanes.ts` | `fixPackByLane` (greedy x-overlap vertical packing per lane). |
| `scrollMapping.ts` | Pure domain ↔ content pixel mapping and zone names. |

## For library authors

- **Library** code stays in `src/lib/`; this folder is **demo-only** and may import the library but must not be imported *by* the published package.
- Reuse patterns: **one `rangeId`**, **dimensional** params for “how wide is one view in domain + how much prefetch per side,” **ticks** for axis decoration, and **local synchronous math** for the main canvas after a shift so `scrollLeft` compensation stays in the same frame as the style guide recommends.

### Synthetic data generation (not part of the library)

`generateElements.ts` builds **lane elements** for a domain interval `[t0, t1]` = the full three-window span (nextLeft + viewable + nextRight). None of this uses `open-range` APIs; it exists so the swimlanes have **repeatable** geometry when the **center** shifts, instead of re-rolling `Math.random()` and watching blocks jump under the same scroll position.

**Grid anchoring.** The axis is split into fixed-width cells of length `DOMAIN_GRID_STEP` (see `constants.ts`). For any requested `[t0, t1]`, the code walks cell indices `g` from `floor(t0 / step)` to `ceil(t1 / step)`. Everything inside a cell is keyed by `(g, lane, k)`, so a given “world” coordinate always belongs to the same cell and the same pseudo-random stream for that slot.

**Deterministic PRNG.** `prng.ts` exposes a small **mulberry32** generator. Seeds come from `cellKeySeed(g, lane, k)` (and a few fixed secondary indices for extra shapes). The same `(g, lane, k)` always yields the same “draw” (whether to place a block, how wide, where inside the cell), which is the whole point: when prefetch windows slide with `updateDimensionalRange`, **overlapping domain intervals reproduce identical blocks** for the overlap, so the layout does not “reshuffle” as the user pans.

**Per-lane candidates.** For each cell that intersects the requested range, the demo iterates all five `laneId` values. Non-dense lanes try a small number of candidate indices `k` with a **high skip probability** (sparse lanes). The lane `DENSE_LANE` uses more candidates and a **low skip probability**, plus different width/placement rules so that lane looks busier. Block **height** and a three-character **tag** for labels are derived from the same seed family (`blockHeightForSeed`, `makeTag3`). Horizontal size is also scaled by `widthScale2to5(s0)` so blocks are not uniform width.

**Chords (optional second pass).** After the main loop, a separate pass can add a larger “chord” bar in the dense lane for some cells (fixed `k` slots like 90/91), gated by an extra draw. That is only to vary silhouette; it still follows the same **grid + seed** contract.

**Takeaway for app authors:** If you back a scroll-box timeline with **server or client data**, you want the same stability property: identity of records should be keyed by **domain position (or a stable id from your backend)**, not by “whatever was fetched last.” This demo fakes that with a grid and seeded PRNG; the library only tells you the **current window in domain space**; how you make pixels stable across shifts is your layer.
