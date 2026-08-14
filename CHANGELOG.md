# Changelog

## 0.4.0

**Breaking.** Unregistration now deletes; errors are typed. Under `^0.3.x`
constraints this version is opt-in (caret ranges on 0.x pin the minor).

- `unregisterReadableRange` / `unregisterDimensionalRange` delete every registry
  entry for the range (conversion store, conversion emitters, basic store,
  basic emitters, initialization subscribers). The 0.3.9 tombstone semantics —
  post-unregister reads returning last-known values — are gone: snapshot what
  you need before unregistering.
- `accessConversionStore` and `updateRange` on an unknown or unregistered id
  throw `RangeNotRegisteredError` (previously a bare `TypeError` from inside
  the library). Accessors created before unregistration also throw it on later
  reads.
- `registerDimensionalRange` on a live id throws `DuplicateRangeIdError`
  (previously a generic `Error`). After unregistration the id is reusable.
- Both error classes are exported and carry a `rangeId` property, so consumers
  can catch narrowly instead of matching message strings.
- `unregisterTicks` deletes its registry entries (including the tick-builder
  fns, which previously leaked); tick ids remain reusable.
- `package.json` now declares `repository`/`bugs`/`homepage`.

Migration from 0.3.x:
1. If you read a range after unregistering it, snapshot the values first.
2. If you relied on "already registered" throws to detect double-mounts,
   catch `DuplicateRangeIdError` instead of matching the message.
3. Workarounds that generated unique rangeIds per mount to dodge the
   unregister leak can return to stable ids.

## 0.3.9

Compatibility-safe garbage-collection fixes. No observable behavior is removed;
one previously-impossible operation becomes possible.

- `unregisterReadableRange` now actually detaches the conversion handlers: they
  were being removed from the conversion emitters, which never held them (they
  live on the basicRange emitters), so an "unregistered" range kept converting.
- A rangeId can be registered again after unregistration. Previously
  `registerDimensionalRange` threw "already registered" forever for any reused
  id in the same JS session, so a consumer remount (HMR, route away and back)
  with a stable id was permanently broken. Fresh registration purges the stale
  entries for that id.
- Post-unregister `accessConversionStore` reads keep returning last-known
  values, but now emit a one-time dev warning: this compatibility read goes
  away in 0.4. Snapshot what you need before unregistering.
- `prepack` now verifies dist entry points exist (`scripts/verify-dist.mjs`);
  0.3.7 shipped to npm with no dist because the build was skipped. This brings
  the repo in line with what 0.3.8 published.

Known remaining leak (fixed in 0.4): store entries for unregistered ranges are
retained as tombstones until their id is reused.

## 0.3.8

Republish of 0.3.7 with the dist actually included.

## 0.3.7

Broken publish — no dist in the tarball. Do not use.
