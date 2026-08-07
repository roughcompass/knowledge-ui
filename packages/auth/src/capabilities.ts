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

  /**
   * Workspaces — the notebooks beside the catalog — as three entries, because the
   * server gates reading, personal writing and team writing differently.
   *
   * Reading admits every role: the router lets any authenticated actor call the
   * workspace endpoints, and which workspaces come back is decided per row by the
   * service's perceivability rule rather than by the caller's role.
   *
   * The two writes are the interesting part, and they cannot be one entry. A
   * personal (`owner_kind='actor'`) workspace is created, renamed, archived and
   * deleted by **its owning producer** — an admin cannot write to somebody's
   * personal notebook, and the service says so in those words. A team
   * (`owner_kind='tenant'`) workspace is the mirror image: **admin only**, and a
   * producer is refused. Merged at the wider grant, each role would be offered
   * half a screen the server refuses; merged at the narrower, nobody could write
   * anything.
   *
   * Owner identity does not appear here, and does not need to. A producer only
   * ever perceives their *own* personal workspaces, so any actor-owned row a
   * producer can see is one they may write. The exception is the auditor, who
   * perceives everyone's — and who holds neither write capability, so the controls
   * are absent for them anyway.
   *
   * Safe from the `audit:read` trap in both directions: producer and admin both
   * sit above consumer in the precedence order, so no principal collapses out of
   * either grant.
   */
  'workspace:read': ['admin', 'producer', 'consumer', 'auditor'],
  'workspace:write:personal': ['producer'],
  'workspace:write:team': ['admin'],

  /**
   * GRAPH — the tenant's projections, and the ontology that constrains them.
   *
   * Two entries because the server draws the line in exactly one place, and it is
   * not where the feature's navigation puts it.
   *
   * The projections (`/v1/graph/provider`, `/v1/graph/consumer`) take
   * `Depends(get_tenant_context)` and no role check at all in `graph.py`: any
   * authenticated actor may ask what their own tenant ships and consumes. So
   * `graph:read` admits all four.
   *
   * The ontology is a different surface with a different gate. Vocabulary values,
   * capability-type schemas and edge-property schemas are all served from
   * `/v1/admin/*` behind `_admin_required`, so `ontology:read` is admin only —
   * even though nothing about reading a list of edge relations feels
   * administrative. The feeling is not the gate.
   *
   * This deliberately does not reuse `admin:manage`. That entry is the *write*
   * capability for operator screens, and a reader who may only look at the
   * ontology would be offered the sync-source controls along with it. Same roles
   * today, different questions — and the parity test checks the question, not the
   * row.
   *
   * Global claim predicates (`/v1/operator/claim-predicates`) are absent from this
   * table on purpose. They are authorised by an exact `(issuer, subject)` pair in
   * the deployment operator allowlist, which is explicitly **not a role** — the
   * router's own words are that every role in this system is tenant-scoped, so no
   * role can serve as the deployment trust root. There is therefore no honest
   * mirror to write: any entry here would offer the screen to somebody the server
   * may still refuse. The ontology page names that absence instead.
   */
  'graph:read': ['admin', 'producer', 'consumer', 'auditor'],
  'ontology:read': ['admin'],
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
