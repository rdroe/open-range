# `mockData` (demos and tests)

Helpers for **synthetic range elements** and **optional persistence** used by the mock-data and datetime mock demos, and by `tests/mock-data.test.ts`. This directory is **not** part of the built npm package (`tsconfig.build.json` excludes it). Import from source paths (e.g. `../lib/mockData/...` in demos) or copy patterns into your app if you need them.

## What `createMockData` does

`create-mock-data.ts` exports `createMockData()`, which returns a **`MockDataCreator`**: a small session-oriented API that produces `MockRangeElement` objects (`{ start, end }` intervals) for any requested range on a numeric axis (often time in ms in the demos).

**Sessions**

- A **session** is identified by a string `sessionId` (see `browserSessionId.ts` for one way to get a stable id per browser profile).
- The first `ensureSession(sessionId, rangeParameters)` call **locks** `RangeParameters` (`zoom`, `unitSize`, `unitsPerViewportWidth` — the same shape as elsewhere in the library’s dimensional range story). Later `ensureSession` calls for the same id do **not** change those parameters; existing generated data is kept.
- `updateLockedParameters` replaces the locked parameters **without** discarding already-generated elements (use when zoom/density changes but you want to keep materialized mock bars).

**Gap-based generation**

- The creator tracks **which domain intervals have already been filled** as a merge of disjoint, sorted spans (`materialized`).
- `getElementsForRange(sessionId, [lo, hi])` computes **gaps**: parts of `[lo, hi]` not yet covered. For each gap it runs a generator, appends new elements to the session list, extends `materialized`, persists, then returns **all** elements that overlap the requested range (not only the new ones).
- Generators are **deterministic** for a given gap: the seed is `hash(sessionId) ^ hash(gapBounds)` so the same session always gets the same layout for the same gap, but different gaps get different “random” layouts. A mulberry32 PRNG drives placement.
- `getElementsForRange` is written so **repeated calls with the same range return the same object references** for already-generated elements (the array is the live session store, filtered by overlap).

**Generation modes** (`CreateMockDataOptions.generationMode`)

- **`default`**: Intervals are sized and spaced from the **viewport width in domain units** (derived from locked `RangeParameters` — `viewportWidth = (unitSize * unitsPerViewportWidth) / zoom`). Produces a dense “strip” of variable-width blocks along the gap.
- **`calendarAligned`**: Picks a **calendar-like step in ms** from the viewport width (minutes through ~years via `pickCalendarGridStepMs`), snaps a grid, and places bars on that grid with some randomness. Good for time-axis demos where edges should look “on the clock.”

**Persistence**

- By default, state lives in an **in-memory** `Map` (lost on reload).
- Pass `persistence: MockPersistenceAdapter` (`getItem` / `setItem` / `removeItem` with string values, async) to survive reloads. The demo uses `indexedDbKeyValue.ts` so data is shared across tabs on the same origin.
- Keys use `persistenceKeyPrefix` (default `open-range:mockRange:`) plus a **session index** key (`...__sessions`) so `clearAll()` can delete every session without a storage “list keys” API.

## Other files

| File | Role |
| --- | --- |
| `browserSessionId.ts` | `getOrCreateBrowserSessionId()` stores one id in `localStorage` per origin so all tabs share a mock “session name”; helpers to generate a human-readable id and to clear it after `clearAll()`. |
| `indexedDbKeyValue.ts` | `createIndexedDbKeyValue(dbName, storeName?)` — minimal async key/value over IndexedDB implementing `MockPersistenceAdapter`. |
| `granularity.ts` | **Not** used inside `create-mock-data`. Constants and `granularityToMilliseconds` for the datetime mock demo: labels and step sizes for second … year (month/year are conventional 30d / 365d). |

## Relationship to the rest of the library

`open-range` itself does not require mock data. This module is a **convenience** for UIs that need plausibly dense intervals on a range and want **stable, gap-filled** behavior when the user pans or zooms—similar in spirit to the scroll-lanes demo’s grid-seeded elements, but with explicit sessions and optional disk backing.
