/**
 * Report date ranges, in Cairo days.
 *
 * A range is two `YYYY-MM-DD` strings, inclusive at both ends, and they mean
 * Cairo days because that is what the database buckets by. Everything here
 * works in that calendar deliberately: a server in UTC computing "today" at
 * 23:00 Cairo would offer yesterday's date, and the owner would be shown an
 * empty dashboard on a busy evening.
 */

export type RangeKey = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

const CAIRO = 'Africa/Cairo';

/** The Cairo calendar date of an instant, as `YYYY-MM-DD`. */
export function cairoToday(now: Date = new Date()): string {
  // `en-CA` formats as YYYY-MM-DD, which is the shape the database wants and
  // the only locale-independent way to get it out of Intl.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Arithmetic on calendar dates, without ever constructing a local Date. */
function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y as number, (m as number) - 1, (d as number) + days));
  return shifted.toISOString().slice(0, 10);
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function lastOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(y as number, m as number, 0)).toISOString().slice(0, 10);
}

/**
 * The presets (FR-073).
 *
 * "This week" starts on Saturday, which is the Egyptian working week — a
 * Monday-start week would cut the shop's busiest two days in half.
 */
export function presetRange(key: Exclude<RangeKey, 'custom'>, now: Date = new Date()): DateRange {
  const today = cairoToday(now);

  switch (key) {
    case 'today':
      return { from: today, to: today };

    case 'week': {
      const [y, m, d] = today.split('-').map(Number);
      const weekday = new Date(Date.UTC(y as number, (m as number) - 1, d as number)).getUTCDay();
      // getUTCDay: 0 = Sunday. Saturday is 6, so Saturday is 0 days back and
      // Sunday is 1.
      const backToSaturday = (weekday + 1) % 7;
      return { from: shiftDays(today, -backToSaturday), to: today };
    }

    case 'month':
      return { from: firstOfMonth(today), to: today };

    case 'lastMonth': {
      const lastMonthDay = shiftDays(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastMonthDay), to: lastOfMonth(lastMonthDay) };
    }
  }
}

/** A `YYYY-MM-DD` that is a real calendar date, not merely the right shape. */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === (m as number) - 1 &&
    parsed.getUTCDate() === d
  );
}

/**
 * Reads a range off the URL, falling back to this month.
 *
 * Anything malformed falls back rather than erroring: a mistyped query string
 * should show the owner a dashboard, not a stack trace. A reversed range is
 * swapped rather than refused, because "from December to March" is a typo with
 * an obvious intention.
 */
export function rangeFromParams(
  params: { from?: string; to?: string },
  now: Date = new Date(),
): DateRange {
  const fallback = presetRange('month', now);

  const from = params.from && isValidDate(params.from) ? params.from : fallback.from;
  const to = params.to && isValidDate(params.to) ? params.to : fallback.to;

  return from <= to ? { from, to } : { from: to, to: from };
}

/** Which preset a range corresponds to, so the button can show as selected. */
export function matchPreset(range: DateRange, now: Date = new Date()): RangeKey {
  for (const key of ['today', 'week', 'month', 'lastMonth'] as const) {
    const preset = presetRange(key, now);
    if (preset.from === range.from && preset.to === range.to) return key;
  }
  return 'custom';
}
