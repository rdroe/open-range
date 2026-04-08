/**
 * Calendar-style granularities for time-axis parameters (ms on the axis).
 * Month/year use common approximations (30d / 365d).
 */
export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

const MS: Record<TimeGranularity, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
}

export const TIME_GRANULARITIES: TimeGranularity[] = [
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'year',
]

export const TIME_GRANULARITY_LABEL: Record<TimeGranularity, string> = {
  second: 'seconds',
  minute: 'minutes',
  hour: 'hours',
  day: 'days',
  week: 'weeks',
  month: 'months (30d)',
  year: 'years (365d)',
}

export function granularityToMilliseconds(g: TimeGranularity): number {
  return MS[g]
}
