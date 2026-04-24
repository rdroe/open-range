import type { MockData2Tags } from './types'

const sortedEntries = (tags: MockData2Tags): [string, string][] =>
  Object.keys(tags)
    .sort()
    .map((k) => [k, tags[k]!] as [string, string])

/** Stable, order-independent id for tag matching and persistence. */
export const tagsKey = (tags: MockData2Tags): string => {
  const e = sortedEntries(tags)
  if (e.length === 0) return '∅'
  return e.map(([k, v]) => `${k}=${v}`).join('\u001f')
}
