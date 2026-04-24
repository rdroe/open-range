# AGENTS.md

Guidance for AI coding agents (and humans new to the repo) working on **open-range**. Read this file first, then skim [STYLEGUIDE.md](STYLEGUIDE.md) for cross-cutting patterns before writing code.

---

## 1. What this project is

`open-range` is a small TypeScript library for **async range tracking**: a single numeric "center input," a **viewable** window around it, and **prefetch** windows on either side. Consumers register async functions that describe those three windows; the library keeps a typed conversion store (`string | number | Date`) and notifies subscribers via `EventTarget`. An optional **ticks** module computes labels per window.

The repo publishes:

- A library (`src/lib/*`) that is built in `--mode lib` into `dist/` and exported as ESM + CJS with subpath entries (`open-range/readableRange`, `open-range/ticks`, etc.).
- A multi-page **demo site** (each `*.html` at the repo root is a Vite entry) that exercises the library in realistic scenarios. Demos are the primary way to see the library end-to-end.

Package manager is **yarn 4 (Berry)** — see `"packageManager": "yarn@4.0.2"` in [package.json](package.json). Do not introduce `npm install` / `pnpm` commands in scripts or docs. Using `npx <bin>` to invoke a locally-installed binary (e.g., `npx tsc --noEmit`) is fine; installing dependencies must go through yarn.

---

## 2. Layout at a glance

```
src/
  lib/                        # published library — keep this lean and dependency-free
    basicRange/               # lowest layer: numeric windows + EventTarget emitters
    readableRange/            # typed wrapper: string | number | Date, conversion store
    dimensionalRange/         # zoom / unitSize / UPVW / prefetch factors → windows
    ticks/                    # per-window tick lists, loading lifecycle
    mockData/                 # IndexedDB-backed mock data used by demos/tests
    index.ts                  # barrel export
  demo/                       # demo code (NOT published)
    main.ts                   # home page (index.html) — embeds multiple demos
    *Demo.ts                  # mountable demo modules
    *DemoEntry.ts             # thin entry points for standalone HTML pages
tests/                        # vitest unit + integration tests
e2e/                          # playwright end-to-end tests against the demo site
*.html                        # Vite multi-page entries (register in vite.config.ts)
```

**Rule of thumb:** anything under `src/lib` ships to users; anything under `src/demo` does not. Do not import `src/demo/*` from `src/lib/*`.

---

## 3. Core concepts an agent must hold in mind

- **rangeId**: a string key that identifies a registered range. Functions in the public API take a `rangeId` first. Registration for the same id twice throws unless explicitly re-registering via the params-update path.
- **Three windows, one center**: every registered range exposes `viewableRange`, `nextLeftRange`, `nextRightRange` — contiguous slices of a 1-D axis centered on the current input. Rendering code should treat them as a single contiguous span `[nextLeftRange.start … nextRightRange.end]` when laying out pixels.
- **Conversion store**: the typed snapshot of those windows in the user's input type (`Date`, `string`, etc.). Access it through `accessConversionStore(rangeId)` rather than reading raw internal state.
- **Events, not returns**: changes propagate through `EventTarget` emitters. Public subscribe-functions return an `unsubscribe` function; always call it on teardown.
- **Initialization is async**: after `registerReadableRange` / `registerDimensionalRange`, wait for `subscribeToRangeInitialization` (fires once) before accessing window values. Earlier reads can race.
- **Ticks are per-window**: `registerTicks` receives a single `[start, end]` tuple and is invoked for each of the three windows independently. Agents writing tick functions should not assume they are being called for the viewable window.

---

## 4. Adding a new demo (common agent task)

Each demo lives under `src/demo` and has two surfaces:

1. A **mount function** (`mountX`, `createX`) that takes an options object (at minimum `{ embedded?: boolean }`) and attaches to a DOM node.
2. A **thin entry file** (`xDemoEntry.ts`) that calls the mount function with `embedded: false`.

Checklist:

- [ ] `src/demo/<name>Demo.ts` exports `mount<Name>Demo(options)`.
- [ ] `src/demo/<name>DemoEntry.ts` imports and invokes it.
- [ ] `<name>-demo.html` at repo root with `<script type="module" src="/src/demo/<name>DemoEntry.ts">` (or `src/demo/<subfolder>/...` if the demo is split into a folder; see [src/demo/scrollLanes/](src/demo/scrollLanes/)).
- [ ] Register the new HTML entry in `vite.config.ts` under `rollupOptions.input`.
- [ ] Add a link on the home page (`src/demo/main.ts`) so the demo is discoverable.
- [ ] If the demo mounts inline, accept `embedded: true` and skip the standalone chrome (back-link, full-page background) in that mode.

See [src/demo/datetimeMockDemo.ts](src/demo/datetimeMockDemo.ts) and [src/demo/scrollDemo.ts](src/demo/scrollDemo.ts) for reference implementations.

---

## 5. Scripts

| Command | Purpose |
|---|---|
| `yarn dev` | Start Vite dev server against the demo site (port 5173). |
| `yarn build` | Build the **library** (`--mode lib`) + emit types via `tsc -p tsconfig.build.json`. |
| `yarn build:demo` | Build the demo site to `site/`. |
| `yarn test` | Vitest unit + integration run. |
| `yarn test:watch` | Vitest in watch mode. |
| `yarn test:coverage` | Vitest with v8 coverage. |
| `yarn test:e2e` | Playwright E2E against the demo site. |
| `yarn playwright:install` | One-time Chromium download for Playwright. |

Type-check only: `npx tsc --noEmit` (fast, no emit). Agents should run this after non-trivial edits.

---

## 6. Coding conventions specific to this repo

- **No comments unless they record a non-obvious *why*.** The code is small and typed; narration belongs in PR descriptions, not source.
- **No emoji** in source or docs unless the user explicitly requests it.
- **Prefer `EventTarget` + detail events** over custom observer frameworks. See [src/lib/internal/detailEvent.ts](src/lib/internal/detailEvent.ts).
- **Input type parameter discipline**: `registerReadableRange<InputType>` and `registerDimensionalRange<InputType>` are generic over `string | number | Date`. Do not widen past `StringOrNumberOrDate`. Provide both `inputToNumber` and `numberToInput` — they must round-trip within tolerance.
- **Do not import from `dist/`** inside the repo. The library source is the source of truth during development.
- **Demos own their UI**. The library never touches the DOM; demos never export from `src/lib`.
- **Async registration**: prefer `await registerReadableRange(...)` over fire-and-forget. The function returns a Promise that resolves after the first window load cycle.
- **Cleanup**: any long-lived listener (window/resize, scroll, timers) attached by a demo or test must be removed on teardown. Tests should never leak emitters — `unregisterReadableRange` / `unregisterDimensionalRange` remove internal listeners but not DOM ones.

---

## 7. Testing expectations

- New library code → **vitest** unit test in `tests/` exercising the public API for that module. Use `fake-indexeddb` when the code path reaches `mockData`.
- New demo or visible behavior change → **playwright** E2E in `e2e/`, driven against `yarn dev:e2e` (port 5320, deterministic host). Use `data-testid` attributes on DOM nodes the test needs to find; the existing demos model this.
- Do not assert on timing: use `subscribeToRangeInitialization` / `subscribeToTicksLoadingComplete` to await state rather than `setTimeout`.
- Determinism: when a test needs a fixed "now," pass a seed through options (see `DATETIME_MOCK_DEMO_DEFAULT_MS` in [src/demo/datetimeMockDemo.ts](src/demo/datetimeMockDemo.ts)) rather than mocking `Date`.

---

## 8. When in doubt, consult [STYLEGUIDE.md](STYLEGUIDE.md)

Cross-cutting patterns — including the **aperture / scrollable-content "scroll box" technique** used by the scroll demo and likely to be reused in future interactive demos — are documented there. Agents adding interactive axis UIs should read the "Scroll-box range control" entry before designing their own.

Topics the style guide covers:

- **Scroll-box range control** — decoupling scroll position from `rangeValue`, quantized (integer-multiple) range updates, and the single-tick remap contract that keeps the viewer from seeing a flicker.
- **Window/slice layout math** — the canonical contiguous-span formula for rendering prefetch + viewable together.
- **Event-driven rendering vs. synchronous remap** — when to subscribe vs. when to compute and paint directly.
- **Demo chrome conventions** — navigation, panels, readouts.

If you add a new cross-cutting pattern while solving a task, extend the style guide rather than scattering the description across demo files.

---

## 9. Things to avoid

- Changing `packageManager` or adding `package-lock.json` / `pnpm-lock.yaml`.
- Adding runtime dependencies to the library. The `dependencies` field should stay empty; everything lives in `devDependencies`.
- Hard-coding `rangeId` strings in library code. They belong to the caller.
- Using `window.setTimeout` inside `src/lib`. Timing belongs in user code and demos.
- Mutating the `conversionStore` export directly. Go through `accessConversionStore(rangeId)` or the update functions.
- Introducing a framework (React/Vue/Svelte) into demos unless the framework is the titular point of that demo. By default, demos are intentionally vanilla DOM.