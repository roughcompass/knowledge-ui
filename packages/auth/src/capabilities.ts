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
