import { describe, expect, it } from 'vitest';

import { customRangeProblem, formatDayRange, periodRange, resolveWindow } from '../dateRange';

/**
 * The window arithmetic, tested where it lives.
 *
 * It used to sit in the usage screen and is now in the kit, because more than one
 * panel shows the active range and any of them can change it. These assertions moved
 * with it rather than being left behind testing a re-export.
 */

describe('the windows a reader can ask for', () => {
  // Mid-Q3, deliberately not on a boundary, so an off-by-one shows up.
  const AUG = new Date('2026-08-08T13:45:00Z');

  it('counts a trailing window inclusively', () => {
    // Seven days ending today is today plus six, not today minus seven. The
    // off-by-one version silently reports an eight-day window as a week.
    expect(periodRange('7d', AUG)).toEqual({ from: '2026-08-02', to: '2026-08-08' });
  });

  it('never ends a to-date window in the future', () => {
    /*
     * The reason these are "to date" rather than whole periods. Q3 2026 ends on
     * 30 September; asking for it in August requests days the service cannot have,
     * and the response would come back narrowed with no explanation the reader
     * could act on.
     */
    expect(periodRange('mtd', AUG)).toEqual({ from: '2026-08-01', to: '2026-08-08' });
    expect(periodRange('qtd', AUG)).toEqual({ from: '2026-07-01', to: '2026-08-08' });
    expect(periodRange('ytd', AUG)).toEqual({ from: '2026-01-01', to: '2026-08-08' });
  });

  it('treats the fiscal year as the calendar year', () => {
    // Stated as an assertion because it is the assumption a reader imports from
    // their own organisation. An April-opening fiscal year would make every one of
    // these figures answer a different question than the label claims.
    expect(periodRange('ytd', AUG)?.from).toBe('2026-01-01');
    expect(periodRange('prevYear', AUG)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('closes a completed quarter on its own last day', () => {
    // Q2, whole, while standing in Q3.
    expect(periodRange('prevQuarter', AUG)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
  });

  it('steps back from Q1 into the previous year, not to a negative month', () => {
    // The boundary the arithmetic gets wrong if it just subtracts three months.
    expect(periodRange('prevQuarter', new Date('2026-02-14T00:00:00Z'))).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
  });

  it('gets February right in a leap year', () => {
    // Derived from day 0 of the following month rather than a table of lengths,
    // which is what makes 29 February fall out correctly.
    expect(periodRange('prevQuarter', new Date('2024-05-05T00:00:00Z'))).toEqual({
      from: '2024-01-01',
      to: '2024-03-31',
    });
    expect(periodRange('mtd', new Date('2024-02-29T00:00:00Z'))).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('resolves a boundary day in UTC rather than local time', () => {
    /*
     * Just after midnight UTC on the first of a month. A local-time `getMonth`
     * here is the previous month for any reader west of Greenwich, which would
     * shift their quarter and year boundaries by a day and nobody else's.
     */
    expect(periodRange('mtd', new Date('2026-07-01T00:30:00Z'))).toEqual({
      from: '2026-07-01',
      to: '2026-07-01',
    });
  });

  it('has no range of its own for a custom period', () => {
    // The reader supplies it, so there is nothing to compute and nothing to guess.
    expect(periodRange('custom', AUG)).toBeNull();
  });
});

describe('a hand-entered range', () => {
  it('is not sent while it is still being typed', () => {
    /*
     * Each of these would otherwise reach the service as a window it answers
     * literally — an empty or inverted range comes back as no traffic, which on
     * this page is indistinguishable from a genuinely quiet fortnight.
     */
    expect(customRangeProblem('', '')).toBe('Enter a start and end date.');
    expect(customRangeProblem('', '2026-08-08')).toBe('Enter a start date.');
    expect(customRangeProblem('2026-08-01', '')).toBe('Enter an end date.');
    expect(customRangeProblem('2026-08-08', '2026-08-01')).toBe(
      'The start date is after the end date.',
    );
  });

  it('accepts a single day', () => {
    // Start equal to end is one calendar day, not an empty range.
    expect(customRangeProblem('2026-08-08', '2026-08-08')).toBeNull();
  });

  it('accepts an ordered range', () => {
    expect(customRangeProblem('2026-01-01', '2026-08-08')).toBeNull();
  });
});

describe('the range as a reader sees it', () => {
  it('states the year once when both ends share it', () => {
    // Repeating the year is noise in a label meant to be read at a glance.
    expect(formatDayRange({ from: '2026-07-28', to: '2026-08-03' })).toBe('28 Jul – 3 Aug 2026');
  });

  it('states both years when the range crosses one', () => {
    // The case where dropping the year would mislead rather than tidy.
    expect(formatDayRange({ from: '2025-12-28', to: '2026-01-03' })).toBe(
      '28 Dec 2025 – 3 Jan 2026',
    );
  });

  it('renders a single day as a date rather than a range to itself', () => {
    expect(formatDayRange({ from: '2026-08-08', to: '2026-08-08' })).toBe('8 Aug 2026');
  });

  it('says so rather than inventing a range it does not have', () => {
    // Reachable while a custom range is half-typed, and "Invalid Date – Invalid Date"
    // is the thing a reader must never be shown in place of a window.
    expect(formatDayRange({ from: '', to: '2026-08-08' })).toBe('No range');
    expect(formatDayRange({ from: 'not-a-day', to: 'nor-this' })).toBe('No range');
  });

  it('does not shift a day into the reader’s timezone', () => {
    /*
     * The failure this prevents: parsing a date-valued day as local time lands on the
     * previous day for every reader west of Greenwich, so a window starting on the
     * 1st would read as the 31st for some people and not others.
     */
    expect(formatDayRange({ from: '2026-03-01', to: '2026-03-01' })).toBe('1 Mar 2026');
  });
});

describe('which range is actually applied', () => {
  const AUG = new Date('2026-08-08T13:45:00Z');
  const FALLBACK = { from: '2026-01-01', to: '2026-01-31' };

  it('applies a preset directly', () => {
    expect(resolveWindow({ periodId: '7d', custom: { from: '', to: '' } }, FALLBACK, AUG)).toEqual({
      range: { from: '2026-08-02', to: '2026-08-08' },
      problem: null,
    });
  });

  it('applies a complete custom range', () => {
    const custom = { from: '2026-03-01', to: '2026-03-31' };
    expect(resolveWindow({ periodId: 'custom', custom }, FALLBACK, AUG)).toEqual({
      range: custom,
      problem: null,
    });
  });

  it('holds the previous range while a custom one is incomplete, and says why', () => {
    /*
     * The panels stay on a window that is labelled rather than querying one that is
     * known to be wrong. An empty or inverted range comes back from the service as no
     * traffic, which on this page is indistinguishable from a genuinely quiet
     * fortnight.
     */
    const result = resolveWindow(
      { periodId: 'custom', custom: { from: '2026-03-31', to: '2026-03-01' } },
      FALLBACK,
      AUG,
    );
    expect(result.range).toEqual(FALLBACK);
    expect(result.problem).toBe('The start date is after the end date.');
  });
});
