import { describe, expect, it } from 'vitest';

import { CursorStack, filterSignature } from '../cursor';

describe('CursorStack', () => {
  it('starts with nowhere to go back to', () => {
    expect(new CursorStack().canGoBack).toBe(false);
    expect(new CursorStack().pop()).toBeNull();
  });

  it('walks forward and back', () => {
    const s = new CursorStack('sig');
    s.push(null); // leaving page 1
    s.push('cursor-a'); // leaving page 2
    expect(s.depth).toBe(2);
    expect(s.pop()).toBe('cursor-a'); // back to page 2
    expect(s.pop()).toBeNull(); // back to page 1, which takes no cursor
    expect(s.canGoBack).toBe(false);
  });

  it('resets when the filter signature changes', () => {
    // Paging back with cursors from a different result set silently shows the
    // wrong rows, so losing the history is the safe outcome.
    const s = new CursorStack('lifecycle=ga');
    s.push(null);
    s.push('cursor-a');
    expect(s.syncSignature('lifecycle=beta')).toBe(true);
    expect(s.depth).toBe(0);
  });

  it('does not reset when the signature is unchanged', () => {
    const s = new CursorStack('lifecycle=ga');
    s.push(null);
    expect(s.syncSignature('lifecycle=ga')).toBe(false);
    expect(s.depth).toBe(1);
  });
});

describe('filterSignature', () => {
  it('is independent of key order', () => {
    // The same filters in a different order are the same result set; treating
    // them as different would reset paging on an unrelated re-render.
    expect(filterSignature({ a: 1, b: 2 })).toBe(filterSignature({ b: 2, a: 1 }));
  });

  it('ignores empty values so an absent filter matches a cleared one', () => {
    expect(filterSignature({ a: 1, b: undefined, c: '' })).toBe(filterSignature({ a: 1 }));
  });

  it('distinguishes different values', () => {
    expect(filterSignature({ lifecycle: 'ga' })).not.toBe(filterSignature({ lifecycle: 'beta' }));
  });
});
