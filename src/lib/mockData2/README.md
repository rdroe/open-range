# `mockData2` (v2 mock range data)

**Standalone** helper for demos and tests: persist **synthetic interval elements** under string **tags**, with a **range-based** storage model. This module is **not** published in the npm `dist` build (see `tsconfig.build.json` exclude for `mockData2`).

## Mental model (vs. v1 `mockData/`)

- **v1** locked `RangeParameters` (zoom, unit size, etc.) and grew a single list of “materialized” domain spans with gap-fill generation. That coupling was easy to misread.
- **v2** has **no** range-parameter API. You pass **tags** (e.g. `session`, `demo`, `lane`, `rangeId` — any `Record<string, string>`) and a **simulated fetch** interval `[start, end]`. State is a set of **tracked** domain ranges, each holding generated elements. Tags pick which store you read/write; the same tag set = same logical “bucket” as a server might key by `user + view + layer`.

## How a fetch is satisfied

1. **Normalize** `start` / `end` (swap if reversed).
2. For the **tag key** (order-independent; see `tagsKey()`), load stored **chunks** — each chunk is a contiguous tracked span `[lo, hi]` plus `elements: { start, end, data }[]` (see **Optional `data`** below).
3. **Gaps** = parts of the requested range **not** covered by the union of existing chunk spans (same idea as v1’s gap pass, but chunks are first-class).
4. **Generate** new elements only for those gaps (deterministic from tag key + gap bounds; see `generateElementsForGap2`).
5. **Merge**:
   - If any existing chunk **overlaps** the request, take those chunks, expand the stored span to the **min** of the request start and the leftmost `lo` and the **max** of the request end and the rightmost `hi`, replace those chunks with **one** chunk whose elements = old elements in those chunks **plus** the newly generated gap elements, then **consolidate** (see below).
   - If **no** chunk overlaps the request but there are gaps (e.g. first load, or a hole between two prior chunks), add **one new chunk per gap** (or several), then consolidate.
6. **Return** all elements that overlap the requested range (not the whole store).

**Consolidation:** after updates, **adjacent or touching** chunk spans (within a tiny numerical epsilon) are merged so the store does not keep redundant boundaries when a later fetch “bridges” two regions.

## Tags

`MockData2Tags` is a plain `Record<string, string>`. Identity is **order-independent**; use whatever dimensions your app needs (session id, demo name, range name, lane id, etc.).

## API

- `createMockData2({ persistence?, persistenceKeyPrefix?, dataPropertyGenerators? })` → `{ fetchRange, clearForTags, clearAll, getSnapshot }`
- `fetchRange(tags, { start, end })` — run the flow above; async for persistence.
- **Persistence** — same pattern as v1: optional `MockPersistenceAdapter2` (`getItem` / `setItem` / `removeItem` of strings). Default is in-memory only.

## Optional `data` on each element

Each `MockRangeElement2` has `data: Record<string, number | string> | null`.

- If **`dataPropertyGenerators`** is **omitted** or **`[]`**, every element’s `data` is **`null`**.
- If non-empty, it is `MockData2DataPropertySpec`: `[propertyName, () => number | string][]`. For every **newly** generated sub-interval, each generator runs **once** and `data` is `{ [name]: value, ... }` (only `number` and `string` values). You can close over a PRNG in those functions for pseudo-random values.
- **Existing** elements loaded from storage keep their stored `data` (or `null` for older JSON without a `data` field, normalized on read). Merges only **append** newly generated elements for gap fills; they do not rewrite `data` on old rows.

## Files

| File | Role |
| --- | --- |
| `create-mock-data2.ts` | Store, merge, and snapshot API. |
| `types.ts` | `MockData2`, elements, tags, options. |
| `tags.ts` | Canonical `tagsKey` for tag matching. |
| `intervals.ts` | Merging domain intervals and gap-in-request. |
| `generate-for-gap.ts` | Seeded PRNG and layout for a single gap. |

## Migration

Existing demos still use `src/lib/mockData/` (v1). Move them to `mockData2` by replacing session + locked params with explicit tags and `fetchRange` only; wire IndexedDB the same way as in v1 demos when you need durability.
