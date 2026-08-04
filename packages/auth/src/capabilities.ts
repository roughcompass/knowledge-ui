import type { Role, Session } from './types';

/**
 * What the UI is allowed to offer, expressed as capabilities rather than roles.
 *
 * Components ask `can(session, 'audit:read')`. Only this table knows which roles
 * carry which capability, so moving a screen between roles is a one-line change
 * here and no component ever mentions a role name. That indirection is what
 * makes adding a fifth role cheap.
 *
 * The table mirrors the server's authorisation, it does not implement it. Every
 * entry here has to match what the API enforces, or the UI offers an action
 * that then fails — which is worse than not offering it. When the two disagree,
 * the API is right.
 */
export const CAPABILITIES = {
  'catalog:browse': ['admin', 'producer', 'consumer', 'auditor'],
  'catalog:search': ['admin', 'producer', 'consumer', 'auditor'],

  /** Write surfaces. Not built yet; the entry exists so nav can be gated when they are. */
  'catalog:edit': ['admin', 'producer'],

  /**
   * Auditor only, and deliberately NOT admin.
   *
   * The audit endpoint requires the auditor role by exact match, with no admin
   * bypass. Because the server collapses a principal's entitlements for a tenant
   * to exactly one role — by precedence admin > producer > consumer > auditor —
   * granting someone both admin and auditor resolves them to admin and refuses
   * them the audit log.
   *
   * So this is not a UI policy choice and adding 'admin' here would not widen
   * access; it would only produce a nav entry that leads to a 403. Reading the
   * audit log means authenticating as a principal whose highest role is auditor.
   */
  'audit:read': ['auditor'],

  /**
   * Health, readiness and metrics. Every role, because the endpoints behind this
   * are unauthenticated — the grouping is a UI decision about where the screens
   * belong, not a permission the server checks.
   */
  'ops:view': ['admin', 'producer', 'consumer', 'auditor'],

  /**
   * Operational health: queue depths, dead-letter counts, and the identity
   * data-quality counters.
   *
   * Deliberately NOT `ops:view`. That capability is granted to every role
   * because the endpoints behind it are unauthenticated probes; this one is
   * gated `require_roles([ROLE_ADMIN])` on the server, and it reports the shared
   * deployment's internals rather than one tenant's. Reusing `ops:view` would
   * put a nav entry in front of three roles that would meet a 403.
   *
   * Admin-only mirrors the server exactly, and is safe from the `audit:read`
   * trap for the same reason `admin:manage` is: admin sits at the top of the
   * precedence order, so any principal the UI shows this to is one the server
   * also resolves to admin.
   */
  'ops:operate': ['admin'],

  /**
   * The operator surfaces: sync connectors, and the configuration screens that
   * follow them.
   *
   * One capability for the whole `/v1/admin/*` family rather than one per resource,
   * because the server has exactly one gate for all of it —
   * `require_roles([ROLE_ADMIN])` via `_admin_common.py`. Splitting it into
   * `admin:sync`, `admin:vocab` and so on would be UI fiction: a distinction this
   * table invented that the API does not enforce. `/v1/admin/audit` is the one
   * exception and it has its own entry above.
   *
   * Not `catalog:edit`. That is admin *and* producer, and a producer following a
   * nav entry here would meet a guaranteed 403 on every request — exactly the
   * failure the `audit:read` note describes.
   *
   * Worth stating because the next reader will ask: this is safe from the
   * `audit:read` trap **by construction**, and the asymmetry is the precedence
   * order. Auditor sits at the bottom, so a principal holding admin and auditor
   * collapses to admin and *loses* audit. Admin sits at the top, so any principal
   * the UI shows this to is a principal the server also resolves to admin. There
   * is no symmetric trap to guard against.
   */
  'admin:manage': ['admin'],

  /**
   * Adoption state, as two entries rather than one.
   *
   * The gates are asymmetric: listing a tenant's adoptions admits every role,
   * while adopting and unadopting are producer-or-admin and exclude consumer
   * outright. One entry could only be as permissive as its narrowest use, so it
   * would either hide state from consumers who are allowed to see it, or offer
   * them a button guaranteed to 403. Neither is acceptable, and the shape of the
   * problem is general: a read and a write over the same resource are two
   * capabilities whenever the server gates them differently.
   *
   * Safe from the `audit:read` trap in both directions. The read admits all four
   * roles, so no principal can collapse out of it; the write admits admin and
   * producer, both above consumer in the precedence order.
   */
  'adoption:read': ['admin', 'producer', 'consumer', 'auditor'],
  'adoption:write': ['admin', 'producer'],

  /**
   * Subscribing to a capability's changes, and reading the inbox they arrive in.
   *
   * Both admit every role — these are tenant-scoped reads and writes over the
   * caller's own subscriptions, not over the capability, so there is no producer
   * boundary to respect.
   */
  'subscription:manage': ['admin', 'producer', 'consumer', 'auditor'],
  'notification:read': ['admin', 'producer', 'consumer', 'auditor'],

  /**
   * Traversing dependencies, dependents, and blast radius.
   *
   * Every role, mirroring a server gate that requires only a tenant context.
   * Worth stating because it looks like it should be narrower: knowing what
   * depends on a capability is exactly what a consumer needs before building on
   * it, and the visibility filter already decides which edges they can see.
   */
  'impact:read': ['admin', 'producer', 'consumer', 'auditor'],

  /**
   * Reading the memory of record: claims with their provenance and confidence,
   * and the session events behind them.
   *
   * Every role, again mirroring a tenant-context-only gate. The interesting part
   * is that this is not an operator surface — an agent's whole reason to query is
   * to get facts it can check, so the audience for a confidence score is the same
   * audience as for the catalog.
   */
  'memory:read': ['admin', 'producer', 'consumer', 'auditor'],

  /**
   * Usage, as two capabilities because the server has two gates.
   *
   * The four aggregate reads are admin-only and describe the whole deployment. The
   * owner-scoped read admits producer as well, and returns only what the caller's
   * tenant owns. A producer is entitled to the second and not the first, so one
   * entry could not serve both: at the wider grant it would offer an operator
   * screen to a producer the API refuses, and at the narrower it would hide a
   * producer's own usage from them.
   *
   * Deliberately **not** `ops:view`. That is granted to every role precisely
   * because the endpoints behind it are unauthenticated probes; these are neither,
   * so reusing it would put a nav entry in front of three roles that would meet a
   * refusal.
   *
   * The API serves only these two scopes — there is no third, tenant-scoped gate,
   * so no third capability is invented to mirror one.
   */
  'usage:read:operator': ['admin'],
  'usage:read:owned': ['admin', 'producer'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

export function can(session: Session | null | undefined, capability: Capability): boolean {
  if (!session) return false;
  return (CAPABILITIES[capability] as readonly Role[]).includes(session.role);
}

/** Every capability a role carries. For the "what this persona unlocks" copy. */
export function capabilitiesFor(role: Role): Capability[] {
  return ALL_CAPABILITIES.filter((c) => (CAPABILITIES[c] as readonly Role[]).includes(role));
}

/**
 * Which roles would grant a capability the current session lacks.
 *
 * Drives the inline explanation on a refused route: naming the role that would
 * work turns a dead end into one click, which matters most for the audit log,
 * where the reason is a server constraint rather than a mistake.
 */
export function rolesGranting(capability: Capability): readonly Role[] {
  return CAPABILITIES[capability];
}
