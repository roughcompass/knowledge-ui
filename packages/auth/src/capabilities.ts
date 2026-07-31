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
