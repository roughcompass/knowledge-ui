/**
 * The mock's identity chain, in its own module.
 *
 * Extracted from `handlers.ts` to break a circular import: `handlers.ts` composes
 * `adminSyncHandlers` into `defaultHandlers`, and `adminSync.ts` needs `roleFor` to
 * gate on admin. With both in one file the cycle resolved differently depending on
 * which module a test imported first — and in the order `handlers.test.ts` produced,
 * `adminSyncHandlers` was still `undefined` when `defaultHandlers` spread it, failing
 * with "adminSyncHandlers is not iterable".
 *
 * A leaf module both sides import has no cycle to resolve.
 */

/**
 * client_id -> role, mirroring the entitlements the seeder installs.
 *
 * This exists so the mocked lane can exercise every persona. Under
 * `client_credentials` the real token's `sub` *is* the `client_id`, and the
 * entitlement service is keyed by `sub` — so the client_id chooses the identity
 * and the seeded entitlement chooses the role. Reproducing that chain here is
 * what makes a persona switch observable without a backend.
 *
 * A flat `makeWhoami()` for every token would quietly make the mocked lane blind
 * to the most important permission rule in the system: the audit log requires
 * `auditor` specifically, so a mock that always answers `consumer` can never show
 * that endpoint working, and can never catch a regression in the gate that hides
 * it.
 *
 * Mirrors the seeder rather than importing the persona roster: the roster is a
 * dev-only module behind a guarded dynamic import, and the server's behaviour is
 * what these handlers are imitating.
 */
const ROLE_BY_CLIENT_ID: Record<string, string> = {
  'knowledge-ui-consumer': 'consumer',
  'knowledge-ui-producer': 'producer',
  'knowledge-ui-admin': 'admin',
  'knowledge-ui-auditor': 'auditor',
  // Two tenant grants, one role. The interesting thing about this identity is the
  // tenant choice, not its permissions.
  'knowledge-ui-multi': 'consumer',
};

/** The `sub` claim of the bearer token, or null when there is no usable one. */
export function subjectOf(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const payload = header.slice('Bearer '.length).split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload)) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** The role the server would resolve for this request's bearer token. */
export function roleFor(request: Request): string {
  const sub = subjectOf(request);
  return (sub && ROLE_BY_CLIENT_ID[sub]) || 'consumer';
}
