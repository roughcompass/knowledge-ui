import { HttpResponse, http, type HttpResponseResolver } from 'msw';

import {
  METRICS_TEXT,
  makeErrorEnvelope,
  makeTenantRequired,
  makeValidationEnvelope,
  makeWhoami,
} from '../fixtures';

/**
 * Per-test overrides for the paths worth asserting on.
 *
 * Each one reproduces a real server behaviour rather than a generic failure, so
 * a test that passes against these has exercised the branch the app will meet in
 * production.
 */

/**
 * The same resolver on every method.
 *
 * The blanket scenarios below — `forbidden`, `unauthenticated`, `rateLimited`,
 * `networkError` — were `http.get` only. That was invisible while the app made no
 * writes, and actively misleading the moment it did: a test asking for `forbidden()`
 * got a 403 on reads while its POST fell through to the real network, where MSW
 * reports it as unhandled and the request either hangs or hits a live server.
 *
 * A refusal is a property of the principal, not of the verb.
 */
const onEveryMethod = (path: string, resolver: HttpResponseResolver) => [
  http.get(path, resolver),
  http.post(path, resolver),
  http.patch(path, resolver),
  http.put(path, resolver),
  http.delete(path, resolver),
];

export const scenarios = {
  /** Two grants and no tenant header: refused, with the choices in the item. */
  tenantRequired: (tenants = ['dev', 'acme']) => [
    http.get('*/v1/whoami', () => HttpResponse.json(makeTenantRequired(tenants), { status: 400 })),
  ],

  unauthenticated: () =>
    onEveryMethod('*/v1/*', () =>
      HttpResponse.json(makeErrorEnvelope('unauthenticated', 'not authenticated'), { status: 401 }),
    ),

  /**
   * A bare 403 with no hint, which is what an unseeded entitlement produces.
   * The seed store is in-memory and empties on every container restart, so this
   * is the most common local failure and the app must name the likely cause.
   */
  forbidden: (path = '*/v1/*') =>
    onEveryMethod(path, () =>
      HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 }),
    ),

  auditForbidden: () => [
    http.get('*/v1/admin/audit', () =>
      HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 }),
    ),
  ],

  rateLimited: (retryAfter = 30) =>
    onEveryMethod('*/v1/*', () =>
      HttpResponse.json(makeErrorEnvelope('rate_limited', 'rate limit exceeded'), {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }),
    ),

  /** The list endpoints answer 400; audit answers 422. Both are covered. */
  invalidCursor: () => [
    http.get('*/v1/capabilities', () =>
      HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), {
        status: 400,
      }),
    ),
    http.get('*/v1/admin/audit', () =>
      HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), {
        status: 422,
      }),
    ),
  ],

  emptyCatalog: () => [
    http.get('*/v1/capabilities', () => HttpResponse.json({ items: [], next_cursor: null })),
  ],

  /** Readiness fails while liveness still passes — the split the two probes exist for. */
  notReady: () => [http.get('*/readyz', () => new HttpResponse('db unreachable', { status: 503 }))],

  /**
   * A metrics snapshot lower than the previous one, which only happens when the
   * process restarted. The UI must draw a gap rather than a negative rate.
   */
  metricsCounterReset: () => [
    http.get(
      '*/metrics',
      () =>
        new HttpResponse(
          METRICS_TEXT.replace(
            'registry_entitlement_calls_total{status_class="2xx"} 42.0',
            'registry_entitlement_calls_total{status_class="2xx"} 1.0',
          ),
          {
            status: 200,
          },
        ),
    ),
  ],

  /** A request that never reaches the server, which is also how CORS presents. */
  networkError: (path = '*/v1/*') => onEveryMethod(path, () => HttpResponse.error()),

  /** Every `/v1/admin/*` route refused, which is what any non-admin role gets. */
  adminForbidden: () =>
    onEveryMethod('*/v1/admin/*', () =>
      HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 }),
    ),

  /**
   * Creating a sync source fails validation.
   *
   * Both halves of a real 422 at once: one `$.`-pathed field error, and one
   * form-level item with `path: null` — the kind `admin_sync.py` raises for an
   * unknown connector, and the kind a form rendering only field errors drops on the
   * floor.
   */
  syncSourceValidationFailed: () => [
    http.post('*/v1/admin/sync-sources', () =>
      HttpResponse.json(
        makeValidationEnvelope([
          { path: '$.display_name', code: 'missing', message: 'Field required' },
          { path: null, code: 'unprocessable_entity', message: 'unknown connector type "nope"' },
        ]),
        { status: 422 },
      ),
    ),
  ],

  /** Triggering a deactivated source. Reachable, with the server's own wording. */
  syncTriggerOnInactive: () => [
    http.post('*/v1/admin/sync-sources/*/trigger', () =>
      HttpResponse.json(
        makeErrorEnvelope('conflict', 'sync_source is inactive; re-activate before triggering'),
        { status: 409 },
      ),
    ),
  ],

  /**
   * The idempotency-key conflict.
   *
   * Unreachable through the app, because a key is minted per call inside
   * `mutationFn` — so this exists to prove the UI renders it as an unexpected
   * failure rather than crashing on a code it has no branch for.
   */
  idempotencyConflict: () => [
    http.post('*/v1/admin/*', () =>
      HttpResponse.json(
        makeErrorEnvelope(
          'idempotency_key_conflict',
          'X-Idempotency-Key was reused with a different request body. Use a fresh key for a new request.',
        ),
        { status: 409 },
      ),
    ),
  ],

  /**
   * A usage summary where a surface genuinely had no callers.
   *
   * A scenario rather than a third surface in the default fixture, because the
   * endpoint declares exactly two — `rest` and `mcp` — and both are spoken for there:
   * one carries a real distinct count, the other the case where the count cannot be
   * recovered. An earlier fixture invented a `webhook` surface to hold this, which is
   * a value the API can never emit.
   *
   * The distinction being tested is the whole reason it needs covering: a real zero is
   * a fact about a quiet surface, and `null` is the absence of a recoverable number.
   * A component testing truthiness rather than null collapses the two, reports an
   * unused platform, and passes every other assertion on the page.
   */
  usageSurfaceWithNoCallers: () => [
    http.get('*/v1/admin/usage/summary', () =>
      HttpResponse.json({
        start: '2026-07-28',
        end: '2026-08-03',
        days: 7,
        surfaces: [
          {
            surface: 'rest',
            calls: 4120,
            ok_calls: 4051,
            error_calls: 69,
            actor_days: 96,
            distinct_actors: 14,
            distinct_actors_unavailable_reason: null,
            payload_bytes: 88_400_000,
            payload_tokens: 2_110_000,
            worst_daily_p95_ms: 412,
          },
          {
            surface: 'mcp',
            calls: 0,
            ok_calls: 0,
            error_calls: 0,
            actor_days: 0,
            // A real zero, not an absence.
            distinct_actors: 0,
            distinct_actors_unavailable_reason: null,
            payload_bytes: null,
            payload_tokens: null,
            // No timed calls, so no percentile exists — not a latency of zero.
            worst_daily_p95_ms: null,
          },
        ],
      }),
    ),
  ],

  whoamiAs: (role: string) => [
    http.get('*/v1/whoami', () => HttpResponse.json(makeWhoami({ role }))),
  ],
} as const;
