/**
 * A served count or reading, as a whole number in the reader's locale.
 *
 * Rounding is presentation, not derivation: the value rendered is the value the
 * API served, cut to the precision a reader can use. A queue depth of
 * `150,582.726` carries three decimals of float noise that change between
 * refetches, so the digits a reader compares across loads are the ones that
 * mean nothing — and sixteen digits of milliseconds reads as debug output
 * rather than a timing.
 *
 * Returns `undefined` for anything that is not a finite number, mirroring
 * [`instantText`](./instantText.ts): the caller renders its honest-absence
 * marker rather than this function inventing "NaN" or "0" — a zero that stands
 * for "unreadable" is the defect this kit exists to prevent.
 */
export function countText(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value).toLocaleString();
}
