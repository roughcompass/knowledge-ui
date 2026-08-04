/**
 * An unknown value as text a reader can act on.
 *
 * `String(value)` is the obvious spelling and it is wrong for exactly one input.
 * Given an object it yields `[object Object]` — a string indistinguishable from
 * real data, which is the worst possible failure for a table cell or a heading:
 * the reader cannot tell that anything went missing, so nobody reports it. That
 * is the same class of defect as rendering zero for an absent number, and this
 * repo treats both as defects rather than cosmetics.
 *
 * So an object is serialised instead. Longer, occasionally ugly, always true —
 * and a column whose values are structured should be passing a `render`, which
 * the visible JSON makes obvious at a glance.
 *
 * `null` and `undefined` become the empty string rather than the words "null"
 * and "undefined", which read as values and are not. A cell with nothing in it
 * is the honest rendering of a field the API did not populate; a caller that
 * wants to distinguish absent from empty renders an em dash itself.
 *
 * Every branch narrows *positively*, which is not stylistic: TypeScript does not
 * narrow `unknown` on the negative side of a `typeof` test, so the natural
 * spelling — bail out on the object case, then `String` the rest — leaves the
 * final value still `unknown` and the hazard still present.
 */
export function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  // Functions serialise to `undefined`, not to a string. Reaching this branch at
  // all means a value nobody meant to render got this far, so it says nothing
  // rather than printing source into a cell.
  return JSON.stringify(value) ?? '';
}
