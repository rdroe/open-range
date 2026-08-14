# Changelog

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
