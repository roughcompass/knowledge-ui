import { HttpResponse, http } from 'msw';

import { METRICS_TEXT, makeErrorEnvelope, makeTenantRequired, makeWhoami } from '../fixtures';

/**
 * Per-test overrides for the paths worth asserting on.
 *
 * Each one reproduces a real server behaviour rather than a generic failure, so
 * a test that passes against these has exercised the branch the app will meet in
 * production.
 */

export const scenarios = {
  /** Two grants and no tenant header: refused, with the choices in the item. */
  tenantRequired: (tenants = ['dev', 'acme']) => [
    http.get('*/v1/whoami', () => HttpResponse.json(makeTenantRequired(tenants), { status: 400 })),
  ],

  unauthenticated: () => [
    http.get('*/v1/*', () =>
      HttpResponse.json(makeErrorEnvelope('unauthenticated', 'not authenticated'), { status: 401 }),
    ),
  ],

  /**
   * A bare 403 with no hint, which is what an unseeded entitlement produces.
   * The seed store is in-memory and empties on every container restart, so this
   * is the most common local failure and the app must name the likely cause.
   */
  forbidden: (path = '*/v1/*') => [
    http.get(path, () =>
      HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 }),
    ),
  ],

  auditForbidden: () => [
    http.get('*/v1/admin/audit', () =>
      HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 }),
    ),
  ],

  rateLimited: (retryAfter = 30) => [
    http.get('*/v1/*', () =>
      HttpResponse.json(makeErrorEnvelope('rate_limited', 'rate limit exceeded'), {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }),
    ),
  ],

  /** The list endpoints answer 400; audit answers 422. Both are covered. */
  invalidCursor: () => [
    http.get('*/v1/capabilities', () =>
      HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), { status: 400 }),
    ),
    http.get('*/v1/admin/audit', () =>
      HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), { status: 422 }),
    ),
  ],

  emptyCatalog: () => [
    http.get('*/v1/capabilities', () => HttpResponse.json({ items: [], next_cursor: null })),
  ],

  /** Readiness fails while liveness still passes — the split the two probes exist for. */
  notReady: () => [
    http.get('*/readyz', () => new HttpResponse('db unreachable', { status: 503 })),
  ],

  /**
   * A metrics snapshot lower than the previous one, which only happens when the
   * process restarted. The UI must draw a gap rather than a negative rate.
   */
  metricsCounterReset: () => [
    http.get('*/metrics', () =>
      new HttpResponse(METRICS_TEXT.replace('registry_entitlement_calls_total{status_class="2xx"} 42.0', 'registry_entitlement_calls_total{status_class="2xx"} 1.0'), {
        status: 200,
      }),
    ),
  ],

  /** A request that never reaches the server, which is also how CORS presents. */
  networkError: (path = '*/v1/*') => [http.get(path, () => HttpResponse.error())],

  whoamiAs: (role: string) => [http.get('*/v1/whoami', () => HttpResponse.json(makeWhoami({ role })))],
} as const;
