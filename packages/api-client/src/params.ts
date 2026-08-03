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

/**
 * The idempotency header, spelled once.
 *
 * `X-Idempotency-Key`, with the `X-` prefix. This constant exists because getting
 * it wrong fails **silently**: the server's dependency returns an inert context
 * when the header is absent, so a misspelled name means both `lookup` and
 * `persist` become no-ops and a retried POST duplicates the write with no error
 * anywhere.
 *
 * That is not a hypothetical. `registry/docs/04-guides/03-sync-connectors.md`
 * documents the header as `Idempotency-Key`, without the prefix — so an operator
 * following the docs gets no idempotency at all. A named constant plus the test
 * asserting its value is what stops the same mistake being made here by hand.
 */
export const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

/**
 * A fresh idempotency key.
 *
 * `randomUUID` needs a secure context. Every browser this app runs in has one, but
 * a jsdom test environment may not, so this falls back rather than throwing — a
 * test asserting the *header* should not fail over the *value*.
 */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `kui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
