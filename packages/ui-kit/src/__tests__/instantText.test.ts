import { describe, expect, it } from 'vitest';

import { instantText } from '../instantText';
import { isoDay } from '../isoDay';

/**
 * Two helpers over the same input that answer differently on purpose, so the tests
 * are mostly about the boundary between them.
 */

describe('instantText', () => {
  it('renders a served instant in the reader local zone', () => {
    // Compared against the platform's own formatting rather than a fixed string:
    // the locale and zone belong to whoever is running this, and pinning either
    // would make the test pass or fail on the machine rather than the code.
    const served = '2026-08-01T10:00:00Z';
    expect(instantText(served)).toBe(new Date(served).toLocaleString());
  });

  it('does not render the raw ISO string it was given', () => {
    // The defect this replaced: `2026-08-01T10:00:00Z` printed verbatim into a
    // column, which a reader has to convert in their head before it means anything.
    const rendered = instantText('2026-08-01T10:00:00Z');
    expect(rendered).not.toContain('T10:00:00Z');
  });

  it('says nothing rather than "Invalid Date"', () => {
    /*
     * `new Date('nonsense').toLocaleString()` is the string "Invalid Date", which
     * lands in a table cell looking exactly like the rendering bug it is. Absence is
     * the honest answer, and lets the caller pick its own em dash.
     */
    expect(instantText('nonsense')).toBeUndefined();
    expect(instantText('')).toBeUndefined();
    expect(instantText(undefined)).toBeUndefined();
    expect(instantText(null)).toBeUndefined();
    expect(instantText({ ts: 1 })).toBeUndefined();
  });

  it('is the wrong tool for a date, and isoDay is the wrong tool for an instant', () => {
    /*
     * The split, asserted, because it is a decision rather than an accident and the
     * next person to add a timestamp column has to pick one.
     *
     * A date-only value localises to whatever midnight UTC is locally, which is the
     * previous day for every reader behind Greenwich — so `isoDay` leaves it alone.
     * An instant carries a time of day and no midnight to fall off, so localising it
     * is both safe and what the reader wants.
     */
    const day = '2026-07-01';
    expect(isoDay(day)).toBe('2026-07-01');

    const instant = '2026-08-01T10:00:00Z';
    // `isoDay` would answer for an instant too, and it would be throwing away the
    // half of the value the reader came for.
    expect(isoDay(instant)).toBe('2026-08-01');
    expect(instantText(instant)).not.toBe('2026-08-01');
  });
});
