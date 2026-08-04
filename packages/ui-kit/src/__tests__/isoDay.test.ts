import { describe, expect, it } from 'vitest';

import { isoDay } from '../isoDay';

/**
 * The point of this helper is the day it must never move, so that is the test.
 */

describe('isoDay', () => {
  it('takes the day out of an instant without parsing it', () => {
    expect(isoDay('2026-07-01T00:00:00Z')).toBe('2026-07-01');
    expect(isoDay('2026-08-04T23:59:59.999Z')).toBe('2026-08-04');
  });

  it('passes a date-only value through unchanged', () => {
    expect(isoDay('2026-07-01')).toBe('2026-07-01');
  });

  it('never shifts the day, in any timezone', () => {
    /*
     * The reason this function exists rather than `new Date(v).toLocaleDateString()`.
     *
     * A UTC midnight parsed and rendered locally lands on the *previous* day for
     * every reader behind Greenwich, so a claim valid from the 1st reads as the 30th
     * in New York. These are provenance values — the day a claim became true, the day
     * an edge was written — and a reader reconciling the screen against an API
     * response or a log needs both to say the same thing.
     *
     * Asserted by comparing against the local parse rather than by faking a
     * timezone: on a machine behind UTC the two disagree and this documents which one
     * is right, and on a UTC machine it still pins the correct answer.
     */
    const served = '2026-07-01T00:00:00Z';
    expect(isoDay(served)).toBe('2026-07-01');

    const localised = new Date(served).toLocaleDateString('en-CA');
    if (new Date(served).getTimezoneOffset() > 0) {
      expect(localised).not.toBe('2026-07-01');
    }
  });

  it('says nothing rather than something wrong for a value that is not a day', () => {
    /*
     * `undefined` and not the empty string: the caller decides how absence looks —
     * an em dash in a table, nothing at all in a caption — and it can only make that
     * choice if it can tell absence apart from a value.
     *
     * The short cases matter most. Slicing ten characters off `2026-07` yields
     * `2026-07`, which would render as a plausible-looking date that is not one, so
     * the shape is checked rather than assumed.
     */
    expect(isoDay('2026-07')).toBeUndefined();
    expect(isoDay('')).toBeUndefined();
    expect(isoDay('not a date at all')).toBeUndefined();
    expect(isoDay(undefined)).toBeUndefined();
    expect(isoDay(null)).toBeUndefined();
    expect(isoDay(1_764_547_200_000)).toBeUndefined();
    expect(isoDay(new Date('2026-07-01'))).toBeUndefined();
  });
});
