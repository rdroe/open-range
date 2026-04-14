/**
 * `CustomEvent` is not on the global object in Node.js 18 (while `Event` / `EventTarget` are).
 * Browsers and Node 20+ provide `CustomEvent`; dedicated Web Workers include it as well.
 * This helper keeps range notifications working in those environments without pulling DOM types
 * into call sites.
 */
const BuiltinCustomEvent = globalThis.CustomEvent as
  | (new <T>(type: string, eventInitDict?: CustomEventInit<T>) => CustomEvent<T>)
  | undefined

class DetailEvent<T> extends Event {
  readonly detail: T
  constructor(type: string, eventInitDict?: CustomEventInit<T>) {
    super(type, eventInitDict)
    this.detail = (eventInitDict?.detail !== undefined
      ? eventInitDict.detail
      : null) as T
  }
}

export function createDetailEvent<T>(
  type: string,
  eventInitDict?: CustomEventInit<T>
): CustomEvent<T> {
  if (typeof BuiltinCustomEvent === 'function') {
    return new BuiltinCustomEvent<T>(type, eventInitDict)
  }
  return new DetailEvent<T>(type, eventInitDict) as CustomEvent<T>
}
