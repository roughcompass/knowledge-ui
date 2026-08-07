/**
 * The display formatters for served quantities. Each one exists because a raw
 * value actively misled: float noise presented as precision, a seconds value
 * read as a count of items, a real payload rendered as "0.0 MB". And each
 * returns `undefined` rather than a fake zero for a value it cannot honestly
 * render, so the caller keeps its own absence marker.
 */
import { describe, expect, it } from 'vitest';

import { bytesText } from '../bytesText';
import { countText } from '../countText';
import { durationText } from '../durationText';

describe('countText', () => {
  it('rounds float noise away and groups the digits', () => {
    expect(countText(150_582.726)).toBe((150_583).toLocaleString());
    expect(countText(7.641875010449439)).toBe('8');
  });

  it('leaves a whole number whole', () => {
    expect(countText(4)).toBe('4');
    expect(countText(0)).toBe('0');
  });

  it('refuses what it cannot honestly render', () => {
    expect(countText(Number.NaN)).toBeUndefined();
    expect(countText(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(countText('42')).toBeUndefined();
    expect(countText(null)).toBeUndefined();
  });
});

describe('durationText', () => {
  it('renders a day-scale age as days and hours', () => {
    // 1 day, 17 hours and change: the reading a bare "150,604.244" hid.
    expect(durationText(150_604.244)).toBe('1d 17h');
  });

  it('renders hour-scale values as hours and minutes', () => {
    expect(durationText(3_720)).toBe('1h 2m');
  });

  it('renders minute-scale values as minutes and seconds', () => {
    expect(durationText(150)).toBe('2m 30s');
  });

  it('keeps whole seconds below a minute', () => {
    expect(durationText(42.4)).toBe('42s');
    expect(durationText(0)).toBe('0s');
  });

  it('drops an empty trailing unit rather than writing a zero', () => {
    expect(durationText(172_800)).toBe('2d');
    expect(durationText(7_200)).toBe('2h');
    expect(durationText(120)).toBe('2m');
  });

  it('refuses negatives and non-numbers', () => {
    // A negative duration is a clock disagreement, not a length of time.
    expect(durationText(-5)).toBeUndefined();
    expect(durationText(Number.NaN)).toBeUndefined();
    expect(durationText('150604')).toBeUndefined();
  });
});

describe('bytesText', () => {
  it('never renders a real payload as zero megabytes', () => {
    expect(bytesText(4_200)).toBe('4.2 KB');
    expect(bytesText(812)).toBe('812 B');
  });

  it('steps units only once the value fills them', () => {
    expect(bytesText(999)).toBe('999 B');
    expect(bytesText(1_000)).toBe('1 KB');
    expect(bytesText(4_567_890)).toBe('4.6 MB');
    expect(bytesText(2_500_000_000)).toBe('2.5 GB');
  });

  it('drops the decimal once it stops meaning anything', () => {
    expect(bytesText(47_300)).toBe('47 KB');
    expect(bytesText(128_000_000)).toBe('128 MB');
  });

  it('renders a true zero as zero bytes', () => {
    // Zero served is a fact; only an unmeasured value must not become one.
    expect(bytesText(0)).toBe('0 B');
  });

  it('refuses negatives and non-numbers', () => {
    expect(bytesText(-1)).toBeUndefined();
    expect(bytesText(null)).toBeUndefined();
    expect(bytesText(Number.NaN)).toBeUndefined();
  });
});
