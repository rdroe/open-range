/**
 * Typed errors so consumers can catch narrowly instead of matching message
 * strings — an uncaught generic Error from inside a React effect takes down an
 * error boundary that the router will not reset on HMR.
 */

export class RangeNotRegisteredError extends Error {
  readonly rangeId: string
  constructor(rangeId: string) {
    super(
      `[open-range] no range is registered for id "${rangeId}" — it was never ` +
        `registered or has been unregistered. Snapshot values before ` +
        `unregistering if you need them afterwards.`
    )
    this.name = 'RangeNotRegisteredError'
    this.rangeId = rangeId
  }
}

export class DuplicateRangeIdError extends Error {
  readonly rangeId: string
  constructor(rangeId: string) {
    super(
      `[open-range] a range is already registered for id "${rangeId}" — ` +
        `unregister it first or use a different id.`
    )
    this.name = 'DuplicateRangeIdError'
    this.rangeId = rangeId
  }
}
