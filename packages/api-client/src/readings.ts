import type { OperationalReading } from './hooks';

/**
 * How to describe a reading, in one place.
 *
 * The rule this enforces: **wherever a cumulative value is displayed, it is
 * labelled cumulative and its reset semantics are stated, and no rate is ever
 * derived client-side from a single observation.**
 *
 * Single-sourced rather than written per page, because the wording *is* the
 * safeguard. A page that phrases it loosely — "since start", or nothing at all —
 * leaves a reader to assume a counter is a current total, and that assumption is
 * invisible until someone quotes the number in a meeting. Two pages describing
 * the same `kind` differently is the same failure arriving slowly.
 *
 * **Why this is a helper and not a lint rule.** No static check can recognise
 * "this number was rendered without its qualifier" — the value and the caption
 * are separate expressions, and a rule strict enough to catch the omission would
 * fire on every legitimate number in the console. So the mechanism is that the
 * qualifier is cheaper to include than to write yourself, and the tests assert
 * the pages include it. Stated plainly here rather than implied, so the next
 * reader knows this is a convention with a helper, not a guarantee.
 *
 * The historical failure worth naming: the page this replaced accumulated a
 * series in component state across refetches and drew it as a trend, which
 * measured how long a tab had been open rather than anything about the service.
 * Deriving a rate from repeated observations of a cumulative counter is the
 * specific thing that must not come back.
 */
export function describeScope(reading: Pick<OperationalReading, 'scope'>): string {
  return reading.scope === 'cluster'
    ? 'Counted across the deployment, now.'
    : 'One replica, since it last restarted.';
}

/**
 * The caveat a section of process-scoped readings needs beneath it.
 *
 * Separate from `describeScope` because it belongs once per section rather than
 * once per row: repeating it against every reading turns the qualifier into
 * chrome the eye skips, which is the state it is meant to prevent.
 */
export function processScopeCaveat(instances: readonly string[]): string {
  const from = instances.length > 0 ? `Read from ${instances.join(', ')}. ` : '';
  return `${from}A request reaches one replica, so a zero here does not prove zero everywhere. These counters reset when a process restarts.`;
}
