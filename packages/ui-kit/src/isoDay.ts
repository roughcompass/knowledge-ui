/**
 * The calendar day out of a timestamp the API served, without moving it.
 *
 * The contextplane answers in ISO 8601 UTC — `2026-07-01T00:00:00Z` for a date-valued
 * field, a full instant for an event. Three spellings of "show that as a day" had
 * accumulated across the app, and two of them were wrong:
 *
 *   `String(value)` printed the whole instant into a table cell, so one column
 *   read `2026-07-01T00:00:00Z` while every other date on the page read
 *   `2026-07-01`.
 *
 *   `new Date(value).toLocaleDateString()` looks like the careful option and is
 *   the one that can be *incorrect*. A date-valued field parses as UTC midnight,
 *   and rendering that in a timezone behind UTC lands on the previous day — so a
 *   claim valid from the 1st reads as the 30th for every reader west of Greenwich.
 *   Shifting a day the server was precise about is worse than showing UTC.
 *
 * So: take the first ten characters. The server already formatted the day; this
 * only stops the rest of the string from arriving with it. No parsing means no
 * timezone, and no timezone means no shift.
 *
 * Deliberately *not* localised. These are audit and provenance values — the day a
 * claim became true, the day an edge was written — and they are compared against
 * what the API returns and what a log says. A reader reconciling a UI against a
 * response needs both to say the same thing, which a locale-dependent rendering
 * cannot promise.
 */
export function isoDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Anything shorter is not a day and must not be padded into looking like one.
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}
