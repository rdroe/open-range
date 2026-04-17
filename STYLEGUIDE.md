# STYLEGUIDE.md

Cross-cutting patterns for **open-range**. Read [AGENTS.md](AGENTS.md) first for repo orientation; this document describes techniques that recur across features and demos.

---

## Scroll-box range control

A common UX for an open-range axis is a horizontally scrollable panel that lets the user pan through the data continuously while the underlying `rangeValue` (the center input) advances in **discrete jumps**. This entry describes the pattern in the abstract; any demo using it should follow the same contract so behavior stays predictable across the product.

### Terminology

- **Aperture** — the fixed-width element with `overflow-x: auto`. This is what the user sees.
- **Scrollable content** — the wider element inside the aperture. Its width spans the full `nextLeftRange + viewableRange + nextRightRange`.
- **rangeValue** — the current center input registered with the range (in whatever the axis's input type is: `Date`, `number`, `string`).
- **originalRangeValue** — captured once at mount; retained so that future `rangeValue`s are always `originalRangeValue + n · viewableRangeSize` for an integer `n`. This keeps the domain grid stable and prevents drift from floating-point accumulation.
- **Sector** — one of the three zones (`nextLeft`, `viewable`, `nextRight`) inside the scrollable content. A sector is defined by the **leftmost visible pixel** (`aperture.scrollLeft`), not by the center of the aperture.

### The core decoupling

**Scroll position is not bound to `rangeValue`.** Scrolling moves the aperture over a static pixel canvas. `rangeValue` changes only when the scroll ends in a sector other than `viewable`. Do not call the range's update function on every `scroll` event — that produces jittery remaps and defeats the whole point of the prefetch windows.

### Sizing

Pick a canonical pixel budget for one viewable range (call it `viewablePx`). The three sectors then occupy:

```
content width = viewablePx · (leftPrefetchFactor + 1 + rightPrefetchFactor)
```

The aperture width should be **less than** `viewablePx` so scrolling inside the viewable sector is meaningful. A common default is `aperturePx = viewablePx / 2`, i.e., the aperture shows half of the viewable range at any moment.

### Initial scroll offset

Start the scroll position inside the viewable sector, not at its boundary. Choose a landing point that gives the user symmetric room to scroll in either direction before triggering a shift. With an aperture equal to half the viewable:

```
aperture.scrollLeft = leftPrefetchFactor · viewablePx + viewablePx / 4
```

This places the aperture over the middle half of the viewable sector — scroll left or right a full quarter of the viewable before either edge of the aperture enters a prefetch sector.

### Detecting a shift (end-of-scroll, not during scroll)

Wait for the scroll to come to rest, then compute the sector:

- If `scrollLeft < leftPrefetchFactor · viewablePx` → shift = **−1** (user moved into nextLeft).
- If `scrollLeft > (leftPrefetchFactor + 1) · viewablePx` → shift = **+1** (user moved into nextRight).
- Otherwise → shift = **0** (still inside viewable; no change).

Use the native `scrollend` event where available and fall back to a debounced `scroll` listener (~120–160 ms) elsewhere. Never use `requestAnimationFrame` for shift detection — you want *user finished*, not *next frame*.

Only **one** viewable-range's worth of shift can be pending per gesture, because the aperture cannot traverse more than one sector while remaining inside the content bounds (given the default sizing). If a configuration allows multi-sector travel in a single gesture, compute `shift = round((scrollLeft − sectorStart) / viewablePx)` instead of ±1; the rest of the contract is unchanged.

### Quantized rangeValue update

When `shift ≠ 0`:

```
shiftCount += shift
rangeValue   = originalRangeValue + shiftCount · viewableRangeSize
```

Compute `rangeValue` from `shiftCount` every time, rather than incrementing the previous `rangeValue`. This is what guarantees exact domain alignment across many pans.

### The single-tick remap contract

After a shift the viewer must not see an intermediate state. The following three operations must happen inside a single synchronous task (one event-loop tick), in this order:

1. Update `rangeValue` (and propagate it to the range store via the appropriate `update…` function).
2. **Recompute and write** the scrollable content (tick marks, data items, any absolute-positioned children) using the new `rangeValue`.
3. **Assign `scrollLeft`** to the compensating value:

```
newScrollLeft = oldScrollLeft − shift · viewablePx
```

Because steps 2 and 3 happen before the browser paints, the user sees the same pixel content under their cursor: the scroll position moved in domain-space by one viewable range, while the visible content appears stationary. This is what produces the "infinite scroll" feel.

**Do not** await an async event (e.g., the range's `ConvertedEndLoading` subscription) before recomputing the DOM. Async propagation is fine for side effects (analytics, secondary panels), but the primary render must be synchronous so the `scrollLeft` adjustment lands in the same frame as the new content. If the range's update path is async and you need the official window values, compute them locally from `rangeValue` and the known dimensional parameters; they will match what the store settles to moments later.

### Suppressing self-triggered scroll events

Programmatic assignment to `scrollLeft` fires a `scroll` (and eventually `scrollend`) event. Handle this with a one-shot suppression flag:

```
suppress = true
render()
aperture.scrollLeft = newScrollLeft   // will fire scrollend asynchronously
// in the scrollend handler:
if (suppress) { suppress = false; return }
```

Even simpler: because `newScrollLeft` always lands inside the viewable sector by construction, the re-entrant handler would compute `shift = 0` and no-op. Use the suppression flag when you also want to skip unrelated readouts; skip it if the cheapest correct code is "let it run." Prefer the flag — it documents the intent.

### Parameter changes while mounted

When the user edits `viewableRangeSize`, a prefetch factor, or the aperture width, the pixel budget changes. Treat this as a reset:

1. Apply the new dimensional parameters to the range (`updateDimensionalRangeParams` or equivalent).
2. Recompute the scrollable content with the new sizing.
3. Reset `scrollLeft` to the canonical initial offset.

Do **not** try to preserve the old scroll position across a parameter change — the sectors have moved and any translation you invent will be misleading.

### When to reach for this pattern

- An infinite-feeling horizontal scroller over a domain that can be represented as `center ± half-window`.
- Any axis where the user's intuition is "I scrolled past the edge, therefore I moved," but the underlying data model is "the current window shifted by one width."

### When *not* to use it

- Small, fully-visible ranges with no prefetch concept — use a plain scrollable list.
- Continuous zoom/pan widgets where every pixel of motion must update `rangeValue` — the decoupling is the wrong model there; subscribe to the range directly and drive the DOM from its events.

### Reference implementation

[src/demo/scrollDemo.ts](src/demo/scrollDemo.ts) applies this pattern to a datetime axis (`viewableRange` default: 7 days, `contentStep`: 1 hour). Treat it as the canonical example; deviations from the contract above in new demos should be justified in the PR description.

---

## Window/slice layout math

For any range with a current input value `c` and dimensional parameters `(viewableSize, leftPrefetchFactor, rightPrefetchFactor)`:

```
viewable.start     = c − viewableSize / 2
viewable.end       = c + viewableSize / 2
nextLeft.start     = viewable.start − leftPrefetchFactor  · viewableSize
nextLeft.end       = viewable.start
nextRight.start    = viewable.end
nextRight.end      = viewable.end   + rightPrefetchFactor · viewableSize
timeline.start     = nextLeft.start
timeline.end       = nextRight.end
```

When mapping domain values to pixels over a contiguous render:

```
pxPerDomain = contentPx / (timeline.end − timeline.start)
xOf(value)  = (value − timeline.start) · pxPerDomain
```

Use this canonical form instead of deriving ad-hoc offsets per-sector; it keeps boundary alignment exact.

---

## Event-driven rendering vs. synchronous remap

The library's public API is event-driven: you subscribe to `RangeConvertedEndLoading`, `TicksLoadingComplete`, etc., and re-render from the store. For most UI that is the right approach — the store is the source of truth and events arrive cheaply.

Two exceptions, both covered elsewhere in this guide:

- **Sub-frame timing** (the scroll-box remap above): derive the post-update state locally and paint synchronously; let the async events catch up.
- **Tests**: prefer deterministic initialization subscriptions (`subscribeToRangeInitialization`, `subscribeToTicksInitialization`) over sleeps.

When a demo blends the two — async for secondary panels, sync for the primary visible surface — keep the boundary explicit in the code (separate functions, not interleaved logic) so a later reader can see which rendering path owns which part of the DOM.

---

## Demo chrome conventions

These are stylistic, but consistent across the demo site makes the UX coherent.

- **Back link** at the top of standalone pages: `← All demos (home)` linking to `/index.html`. Omit when `embedded: true`.
- **Params panel** (inputs + reset button) as a CSS grid with `repeat(auto-fit, minmax(220px, 1fr))`. Each input is a `<label>` containing a caption and a numeric `<input>` with `data-testid="…-param-<key>"`.
- **Readouts** in a monospace grid below the params — label in `#71717a`, value in `#fafafa`.
- **Color palette**: background `#0d0d0f`, panel `#18181b`, surface `#0c0c0e`, border `#3f3f46`, muted text `#a1a1aa`, primary text `#fafafa`, accent blue `#60a5fa` / `#3b82f6`.
- **Center indicator**: a 2 px vertical line with a soft blue glow (`box-shadow: 0 0 8px rgba(59,130,246,0.5)`).

Agents copying chrome from one demo to another should lift the style blocks verbatim rather than re-deriving the hex values.
