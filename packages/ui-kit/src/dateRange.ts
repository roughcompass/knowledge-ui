/**
 * The windows a reader can ask for, and the arithmetic behind them.
 *
 * Lifted out of the usage screen because more than one panel now shows the active
 * range and any of them can change it. A second copy of quarter arithmetic is the
 * thing that would drift, and it would drift silently: two panels disagreeing about
 * where a quarter starts look identical until someone reconciles two exports.
 *
 * Three kinds of window, and the third needs stating rather than assuming.
 *
 * **Trailing** — the last N days including today. What most readers want most of
 * the time.
 *
 * **To date** — from the start of the current month, quarter or year up to today.
 * Deliberately not "the current quarter" whole: the rest of it has not happened,
 * and a window ending in the future asks a service for days it cannot have.
 *
 * **Completed** — the previous quarter or year, whole. The comparison a reader
 * reaches for once a period closes.
 *
 * ## Fiscal periods here are the calendar's
 *
 * The quarter and year windows are calendar quarters and calendar years — Q1 is
 * January to March, and the fiscal year opens on 1 January. It is stated in the
 * option labels and here because it is an assumption a reader imports from their own
 * organisation, and one whose fiscal year opens in April would read every figure
 * against the wrong period. A non-calendar fiscal year is a new set of options with
 * the offset named, never a re-reading of these.
 */

export const PERIODS = [
  { id: '7d', label: 'Last 7 days', kind: 'trailing', days: 7 },
  { id: '30d', label: 'Last 30 days', kind: 'trailing', days: 30 },
  { id: '90d', label: 'Last 90 days', kind: 'trailing', days: 90 },
  { id: 'mtd', label: 'Month to date', kind: 'toDate', unit: 'month' },
  { id: 'qtd', label: 'Quarter to date (calendar Q)', kind: 'toDate', unit: 'quarter' },
  { id: 'ytd', label: 'Year to date (calendar Y)', kind: 'toDate', unit: 'year' },
  { id: 'prevQuarter', label: 'Previous quarter (calendar Q)', kind: 'completed', unit: 'quarter' },
  { id: 'prevYear', label: 'Previous year (calendar Y)', kind: 'completed', unit: 'year' },
  { id: 'custom', label: 'Custom range', kind: 'custom' },
] as const;

export type PeriodId = (typeof PERIODS)[number]['id'];

export interface DayRange {
  from: string;
  to: string;
}

/** What a reader has chosen: a preset, plus the range they typed if it is custom. */
export interface WindowSelection {
  periodId: PeriodId;
  custom: DayRange;
}

/**
 * A `Date` as the calendar day these endpoints take.
 *
 * Named apart from the kit's existing `isoDay`, which does the opposite job — it
 * takes the day out of a string the server already formatted. Two functions with one
 * name would have one of them called by mistake eventually, and the mistake would be
 * silent because both return something day-shaped.
 */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today, as a calendar day. The upper bound on any window a service can answer. */
export function todayAsDay(): string {
  return dayOf(new Date());
}

/**
 * All of this arithmetic is UTC.
 *
 * These endpoints take a calendar day rather than an instant, and a local-time
 * `getMonth` on the first of a month is the previous month for anybody west of
 * Greenwich — which would shift every quarter and year boundary by a day for some
 * readers and not others.
 */
function startOfPeriod(now: Date, unit: 'month' | 'quarter' | 'year'): Date {
  const year = now.getUTCFullYear();
  if (unit === 'year') return new Date(Date.UTC(year, 0, 1));
  const month = now.getUTCMonth();
  if (unit === 'month') return new Date(Date.UTC(year, month, 1));
  return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1));
}

function completedPeriod(now: Date, unit: 'quarter' | 'year'): DayRange {
  const year = now.getUTCFullYear();
  if (unit === 'year') {
    return {
      from: dayOf(new Date(Date.UTC(year - 1, 0, 1))),
      to: dayOf(new Date(Date.UTC(year - 1, 11, 31))),
    };
  }
  const quarter = Math.floor(now.getUTCMonth() / 3);
  // Q1 steps back into the previous year's Q4 rather than to month -3.
  const previous = quarter === 0 ? { year: year - 1, quarter: 3 } : { year, quarter: quarter - 1 };
  const startMonth = previous.quarter * 3;
  return {
    from: dayOf(new Date(Date.UTC(previous.year, startMonth, 1))),
    // Day 0 of the month after the period is that period's last day, which avoids
    // hard-coding month lengths and is right in a leap year.
    to: dayOf(new Date(Date.UTC(previous.year, startMonth + 3, 0))),
  };
}

/**
 * The range a preset resolves to, or `null` for the custom period, which has no
 * range of its own — the reader supplies it.
 */
export function periodRange(id: PeriodId, now: Date): DayRange | null {
  const period = PERIODS.find((p) => p.id === id) ?? PERIODS[0];

  if (period.kind === 'custom') return null;

  if (period.kind === 'trailing') {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - (period.days - 1));
    return { from: dayOf(from), to: dayOf(now) };
  }

  if (period.kind === 'completed') return completedPeriod(now, period.unit);

  // To-date, so the end is today and never the period's own end.
  return { from: dayOf(startOfPeriod(now, period.unit)), to: dayOf(now) };
}

/**
 * Whether a hand-entered range can be sent, and why not when it cannot.
 *
 * Returns the reason rather than a boolean so the control can say what is wrong. An
 * inverted or half-filled range is an editing state, not an error worth an error
 * panel — but it must not be sent, because a service answers it with an empty window
 * that looks exactly like a quiet fortnight.
 */
export function customRangeProblem(from: string, to: string): string | null {
  if (from === '' && to === '') return 'Enter a start and end date.';
  if (from === '') return 'Enter a start date.';
  if (to === '') return 'Enter an end date.';
  if (from > to) return 'The start date is after the end date.';
  return null;
}

/** The label a period carries in the picker. */
export function periodLabel(id: PeriodId): string {
  return (PERIODS.find((p) => p.id === id) ?? PERIODS[0]).label;
}

/**
 * The range as a reader should see it: `28 Jul – 3 Aug 2026`.
 *
 * The year appears once when both ends share it, because repeating it is noise in a
 * label meant to be read at a glance — and it appears on both ends when they differ,
 * because that is the case where leaving it off would mislead. A single day renders
 * as one date rather than as a range to itself.
 *
 * Fixed to `en-GB` month names rather than the reader's locale: the ISO dates in the
 * table beside this are unambiguous, and a label that reorders day and month between
 * readers makes two screenshots of the same window disagree.
 */
export function formatDayRange({ from, to }: DayRange): string {
  if (from === '' || to === '') return 'No range';

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'No range';

  const day = (d: Date) => String(d.getUTCDate());
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = (d: Date) => String(d.getUTCFullYear());

  if (from === to) return `${day(start)} ${month(start)} ${year(start)}`;

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startPart = sameYear
    ? `${day(start)} ${month(start)}`
    : `${day(start)} ${month(start)} ${year(start)}`;
  return `${startPart} – ${day(end)} ${month(end)} ${year(end)}`;
}

/**
 * The range a selection resolves to, and the reason it could not be applied.
 *
 * While a hand-entered range is incomplete the caller's last valid range stays
 * applied rather than the page querying something it knows is wrong. That is safe
 * only because every panel reports the window it actually got, so nothing on screen
 * is unlabelled — and the control says separately that the range being typed has not
 * been applied.
 */
export function resolveWindow(
  selection: WindowSelection,
  fallback: DayRange,
  now: Date,
): { range: DayRange; problem: string | null } {
  if (selection.periodId === 'custom') {
    const problem = customRangeProblem(selection.custom.from, selection.custom.to);
    return { range: problem === null ? { ...selection.custom } : fallback, problem };
  }
  return { range: periodRange(selection.periodId, now) ?? fallback, problem: null };
}
