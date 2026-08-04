/**
 * A moment in time, in the reader's own timezone.
 *
 * The counterpart to [`isoDay`](./isoDay.ts), and the split between them is the
 * point. Both take an ISO string from the same API and they answer differently on
 * purpose:
 *
 *   A **day** — the date a claim became true, the date an edge was written — is
 *   rendered as served, in UTC. Localising it would move it: a UTC midnight
 *   rendered west of Greenwich lands on the previous day, so a value the server was
 *   precise about would disagree with the API by one.
 *
 *   An **instant** — when a notification was raised, when a run started, when an
 *   audit entry was written — is rendered locally. It carries a time of day, so
 *   there is no midnight to fall off, and the question a reader is asking is "how
 *   long ago was this, for me". `2026-08-01T10:00:00Z` in a table answers that
 *   badly: it needs converting in the reader's head before it means anything, and
 *   the `T` and the `Z` are noise once it has been.
 *
 * Three spellings of this had accumulated — a raw ISO string in the notifications
 * inbox, and `new Date(x).toLocaleString()` written out twice — so this exists to
 * make the decision once and record why it goes the other way for a date.
 */
export function instantText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  // An unparseable timestamp says nothing rather than "Invalid Date", which is a
  // string that looks like a rendering bug because it is one.
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}
