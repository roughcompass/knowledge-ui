/**
 * Identity, exactly as the server reports it.
 *
 * Nothing in this module derives a role, a tenant or a permission from local
 * state. The registry resolves all of that from the bearer token and returns it
 * from `GET /v1/whoami`; a UI that decided for itself would offer actions the
 * server then rejects, which is a worse experience than not offering them.
 */

/**
 * The four roles the registry issues.
 *
 * Written in the server's precedence order — highest first. A principal holding
 * several entitlements for one tenant is collapsed to a single role by that
 * order *by the server*, before the UI ever sees it. The order is recorded here
 * because it explains the shape of `Session.role` (one role, never a set); it is
 * not applied client-side.
 */
export type Role = 'admin' | 'producer' | 'consumer' | 'auditor';

/** The roles as a runtime value, same order. */
export const ROLES = ['admin', 'producer', 'consumer', 'auditor'] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Hypermedia links on a whoami payload.
 *
 * Which relations appear depends on the principal, so the shape stays open.
 */
export interface WhoamiLinks {
  self?: string;
  [rel: string]: string | null | undefined;
}

/**
 * The whoami wire shape.
 *
 * Restated here rather than imported from the generated OpenAPI bindings, for
 * two reasons that are both about the difference between the schema and the
 * bytes:
 *
 * 1. The response is serialised with unset fields excluded. The schema lists
 *    `token_id`, `token_expires_at` and `_links` as nullable, which reads as
 *    "present, possibly null" — but they are frequently *absent* keys. Anything
 *    built from this payload has to treat them as optional, not merely nullable.
 * 2. `roles` is typed as an open `string[]`. It always arrives as exactly one
 *    element, and the element is one of four known values.
 *
 * Keeping the shape local also keeps this package independent of the API client:
 * the client is constructed *with* a token source from here, so the dependency
 * has to run in that direction and only that direction.
 */
export interface WhoamiResponse {
  actor_id: string;
  actor_display_name: string | null;
  actor_email: string | null;
  tenant_id: string;
  tenant_slug: string;
  tenant_display_name: string;
  /** Always one element — the server has already collapsed multiple grants. */
  roles: string[];
  /** Deprecated and always null when present at all; tokens are not registry-issued. */
  token_id?: string | null;
  /** Deprecated and always null when present at all; lifetime is the token's own `exp`. */
  token_expires_at?: string | null;
  _links?: WhoamiLinks | null;
}

/**
 * The resolved session the whole app reads from.
 *
 * Flat and readonly on purpose: it is passed across the federation boundary as a
 * prop, and a value that mutates in place would leave remotes rendering against
 * a snapshot React never told them had changed.
 */
export interface Session {
  readonly actorId: string;
  readonly actorDisplayName: string | null;
  readonly actorEmail: string | null;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantDisplayName: string;
  readonly role: Role;
  /**
   * Which credential this session was minted from. In development that is a
   * persona key; otherwise it is the auth strategy's name. Carried so the UI can
   * say whose eyes it is showing, and so a token cache entry can be tied back to
   * the identity that produced it.
   */
  readonly personaKey: string;
}

/**
 * Build a `Session` from a whoami payload.
 *
 * Only the fields that actually arrived are read — see `WhoamiResponse` on why
 * the optional ones cannot be relied on.
 *
 * Throws when `roles` carries nothing recognisable. There is no safe default: a
 * guess at the least-privileged role would still grant catalog browsing to a
 * principal the server may have meant to refuse, and a guess at any other role
 * would offer actions that then fail. A hard failure at the boundary is the only
 * honest option, and it means the seeded entitlements are wrong — which is a
 * fixable, local problem.
 */
export function toSession(whoami: WhoamiResponse, personaKey: string): Session {
  const role = whoami.roles[0];
  if (!isRole(role)) {
    throw new Error(
      `whoami returned no usable role (roles: ${JSON.stringify(whoami.roles)}). ` +
        `Expected exactly one of ${ROLES.join(', ')}.`,
    );
  }

  return {
    actorId: whoami.actor_id,
    actorDisplayName: whoami.actor_display_name,
    actorEmail: whoami.actor_email,
    tenantId: whoami.tenant_id,
    tenantSlug: whoami.tenant_slug,
    tenantDisplayName: whoami.tenant_display_name,
    role,
    personaKey,
  };
}
