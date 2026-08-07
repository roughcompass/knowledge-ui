/**
 * A duration served in seconds, as a length of time a reader can weigh.
 *
 * `150,604.244` labelled "age" reads as a hundred and fifty thousand of
 * something; the same value as `1d 17h` answers the question the reader is
 * actually asking — how stale is this, and does it need attention today. The
 * unit is the server's, not inferred: the readings this formats are keyed
 * `…_seconds`, so converting between time units is presentation of a served
 * value, not a client-derived metric.
 *
 * Two units at most, largest first, because a third adds precision below what
 * any decision here turns on: nobody triages a day-old proposal differently
 * for its minutes. Sub-minute values keep whole seconds for the same reason.
 *
 * Returns `undefined` for anything that is not a finite non-negative number,
 * so the caller renders its honest-absence marker; a negative duration is a
 * clock disagreement, not a length of time, and pretending otherwise hides it.
 */
export function durationText(seconds: unknown): string | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return undefined;

  const total = Math.round(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  return `${secs}s`;
}
