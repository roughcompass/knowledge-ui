import { describe, expect, it } from 'vitest';

import { diffKeys } from '../JsonDiff';
import { armShares } from '../RetrievalArmsBar';

/**
 * The pure logic inside the remaining gap components. Rendering is covered by the
 * accessibility and end-to-end lanes; these are the branches that quietly
 * produce NaN or a wrong picture.
 *
 * `buildPath` used to be tested here too. It belonged to `Sparkline`, a hand-rolled
 * SVG trend line that no screen ever rendered — the charting work replaced the one
 * mark that did have a consumer, and removing the unused one took its arithmetic
 * with it rather than leaving tests standing over code nothing calls.
 */

describe('diffKeys', () => {
  it('marks an added key', () => {
    expect(diffKeys({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { key: 'a', before: 1, after: 1, status: 'unchanged' },
      { key: 'b', before: undefined, after: 2, status: 'added' },
    ]);
  });

  it('marks a removed key', () => {
    expect(diffKeys({ a: 1, b: 2 }, { a: 1 })[1]).toMatchObject({ key: 'b', status: 'removed' });
  });

  it('marks a changed key', () => {
    expect(diffKeys({ a: 1 }, { a: 2 })[0]).toMatchObject({ status: 'changed' });
  });

  it('treats a create as all-added rather than failing on a null before', () => {
    // The audit log stores null on the missing side of a create or delete.
    const entries = diffKeys(null, { a: 1 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'added' });
  });

  it('treats a delete as all-removed', () => {
    expect(diffKeys({ a: 1 }, null)[0]).toMatchObject({ status: 'removed' });
  });

  it('returns nothing when both sides are absent', () => {
    expect(diffKeys(null, null)).toEqual([]);
  });

  it('compares nested values structurally, not by reference', () => {
    // Both sides come from separate JSON.parse calls, so identity is never true.
    expect(diffKeys({ a: { x: 1 } }, { a: { x: 1 } })[0]).toMatchObject({ status: 'unchanged' });
    expect(diffKeys({ a: { x: 1 } }, { a: { x: 2 } })[0]).toMatchObject({ status: 'changed' });
  });

  it('sorts keys so two renders of the same change agree', () => {
    expect(diffKeys({ b: 1, a: 1 }, { b: 1, a: 1 }).map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('ignores a non-object side rather than throwing', () => {
    expect(diffKeys('a string', { a: 1 })[0]).toMatchObject({ status: 'added' });
  });
});

describe('armShares', () => {
  it('turns contributions into percentages that sum to 100', () => {
    const shares = armShares({ semantic: 1, lexical: 1, graph: 2 });
    expect(shares?.map((s) => s.pct)).toEqual([25, 25, 50]);
  });

  it('returns null when nothing contributed, rather than NaN widths', () => {
    // A result can come back with every reported arm at zero; dividing by the
    // total would render segments of width NaN.
    expect(armShares({})).toBeNull();
    expect(armShares({ semantic: 0, lexical: 0, graph: 0 })).toBeNull();
  });

  it('treats a missing arm as zero', () => {
    const shares = armShares({ semantic: 3 });
    expect(shares?.find((s) => s.key === 'semantic')?.pct).toBe(100);
    expect(shares?.find((s) => s.key === 'graph')?.pct).toBe(0);
  });

  it('clamps a negative contribution to zero', () => {
    const shares = armShares({ semantic: 2, lexical: -5 });
    expect(shares?.find((s) => s.key === 'lexical')?.pct).toBe(0);
  });
});
