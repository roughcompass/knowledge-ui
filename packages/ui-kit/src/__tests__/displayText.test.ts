import { describe, expect, it } from 'vitest';

import { displayText } from '../displayText';

/**
 * The one function in the kit whose whole reason to exist is a string it must
 * never produce, so that is what these assert.
 */

describe('displayText', () => {
  it('never produces the string that looks like data and is not', () => {
    /*
     * Load-bearing, and the reason the helper exists at all. `[object Object]` in a
     * table cell or a page title is worse than a blank: a reader cannot tell it from
     * a real value, so nobody files it, and the field it replaced is simply gone.
     *
     * Asserted against every shape that reaches `Object.prototype.toString` — a
     * plain object, an array, a class instance, a null-prototype bag — rather than
     * against one example, because the defect is a property of the fallback branch
     * and any input that lands there brings it back.
     */
    class Thing {
      constructor(public id = 'c-1') {}
    }
    const shapes: unknown[] = [
      { name: 'salt-ds' },
      [1, 2, 3],
      new Thing(),
      Object.create(null),
      new Map(),
    ];

    for (const shape of shapes) {
      expect(displayText(shape)).not.toContain('[object');
    }
  });

  it('serialises an object rather than summarising it', () => {
    // A structured value is still data. The alternative — a placeholder, or the
    // empty string — silently drops a field the API did populate, and the visible
    // JSON is also the clearest possible hint that the column wants a `render`.
    expect(displayText({ name: 'salt-ds', version: '3.2.0' })).toBe(
      '{"name":"salt-ds","version":"3.2.0"}',
    );
  });

  it('returns a string unchanged, without a round trip through JSON', () => {
    // Not a micro-optimisation: quoting is the failure here. `JSON.stringify` on a
    // string yields `"salt-ds"` with the quotes, which would show up in every cell
    // in the app.
    expect(displayText('salt-ds')).toBe('salt-ds');
    expect(displayText('')).toBe('');
  });

  it('renders absence as nothing, not as the word for it', () => {
    /*
     * "null" and "undefined" read as values. A reader scanning a column cannot tell
     * the difference between a field the API left out and one whose content is
     * literally that word, and the first is common.
     *
     * Empty rather than an em dash: a caller that needs to *mark* the absence knows
     * the difference between absent and empty, and this function does not.
     */
    expect(displayText(null)).toBe('');
    expect(displayText(undefined)).toBe('');
  });

  it('keeps numbers, booleans and bigints legible', () => {
    expect(displayText(0)).toBe('0');
    expect(displayText(42)).toBe('42');
    expect(displayText(-1.5)).toBe('-1.5');
    expect(displayText(false)).toBe('false');
    expect(displayText(10n)).toBe('10');
  });

  it('renders zero as zero', () => {
    // Called out separately because the obvious implementation gets it wrong:
    // `value || ''` and `value ?? ''` differ exactly here, and a falsy-test would
    // erase a real count of nothing — which this repo treats as a defect rather
    // than a rounding of the truth.
    expect(displayText(0)).toBe('0');
  });

  it('says something for a value that cannot be serialised at all', () => {
    // A function has no JSON representation, so the serialising branch returns
    // `undefined` rather than a string. Reaching this at all means a value nobody
    // meant to render got passed in; it must degrade to empty, not to `undefined`.
    expect(displayText(() => 'nope')).toBe('');
    expect(displayText(Symbol('claim'))).toBe('Symbol(claim)');
  });
});
