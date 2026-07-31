/**
 * Query-parameter helpers, each one encoding a constraint the API enforces.
 */

/**
 * Serialise a timestamp the way the API demands.
 *
 * The server rejects a naive timestamp with a 400 and a message about ISO-8601:
 * it parses the value and then requires it to be timezone-aware, because a
 * bitemporal query against a floating local time is ambiguous. `toISOString()`
 * always emits the `Z` suffix, so this is the only correct spelling and it is
 * worth having one place that guarantees it.
 */
export function toApiTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`not a valid timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

/** Server-enforced page-size bounds, one per endpoint that pages. */
export const PAGE_LIMITS = {
  capabilities: { min: 1, max: 200, default: 20 },
  audit: { min: 1, max: 500, default: 50 },
  /** Search calls this `top_k`, and its ceiling is lower than the list endpoints'. */
  search: { min: 1, max: 100, default: 10 },
} as const;

export type PagedEndpoint = keyof typeof PAGE_LIMITS;

/**
 * Clamp a page size into the range the endpoint accepts.
 *
 * Clamping rather than rejecting: the value usually arrives from a URL a user
 * can edit, and silently honouring the nearest legal size is friendlier than a
 * validation error for something with an obvious right answer.
 */
export function clampPageSize(endpoint: PagedEndpoint, requested: number | undefined): number {
  const { min, max, default: fallback } = PAGE_LIMITS[endpoint];
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(requested)));
}

/** Drop empty values so they never reach the query string as `?x=`. */
export function compact<T extends Record<string, unknown>>(params: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
