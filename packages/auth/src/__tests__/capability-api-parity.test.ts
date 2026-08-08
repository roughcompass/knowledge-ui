import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ALL_CAPABILITIES, CAPABILITIES } from '../capabilities';
import type { Capability, Role } from '../index';

/**
 * Every path the API publishes, read from the vendored OpenAPI document.
 *
 * Read as JSON rather than imported from the generated client, because the
 * generated module exports types only — erased at build time, so there is nothing
 * to enumerate at runtime. The document is the same input the client is generated
 * from, and a drift between it and the live contextplane is caught by its own gate.
 */
const SPEC_PATHS: string[] = Object.keys(
  (
    JSON.parse(
      readFileSync(
        new URL('../../../api-client/openapi/contextplane.openapi.json', import.meta.url),
        'utf8',
      ),
    ) as { paths: Record<string, unknown> }
  ).paths,
);

/**
 * Pull the path out of an endpoint description like `GET /v1/notifications`.
 *
 * Anchored on the roots the API actually serves rather than on "starts with a
 * slash", because a description may name more than one method — `POST/PATCH
 * /v1/capabilities` would otherwise yield `/PATCH`. Found by this test failing on
 * exactly that the first time it ran.
 */
function pathsFromEndpoint(endpoint: string): string[] {
  return [...endpoint.matchAll(/(\/(?:v1|healthz|readyz|metrics)[^\s,]*)/g)].map(
    (m) => m[1] as string,
  );
}

/**
 * Every capability mirrors a real server gate, and this is where that is checked.
 *
 * The capability table's own docstring states the rule — it mirrors the API's
 * authorisation, it does not invent it, and when the two disagree the API is
 * right. Until now that was a comment. A comment cannot notice that someone
 * added `reports:read` to three roles for an endpoint that admits one, and the
 * failure mode is the worst kind the UI has: a nav entry or a button that is
 * offered to a reader the server will refuse. A guaranteed 403 is worse than an
 * absent control, because the reader believes they should have been able to.
 *
 * So each capability declares the gate it mirrors, in the server's own terms,
 * and the table has to agree with it.
 */

interface Gate {
  /** The endpoint or family this capability is the UI's mirror of. */
  endpoint: string;
  /**
   * The path as the OpenAPI document spells it, when `endpoint` does not.
   *
   * Only needed where `endpoint` names a family with a wildcard, or describes two
   * routes at once. Where it is a single path, it is parsed out of `endpoint`
   * directly — the point is that the claim gets checked, not that it gets
   * restated.
   */
  serverPath?: string;
  /**
   * The roles the *server* admits. Read from the router, not from intuition:
   * `_auditor_required` in `admin_audit.py`, `require_roles([ROLE_PRODUCER,
   * ROLE_ADMIN])` in `capabilities.py`, `_admin_required` in `_admin_common.py`.
   */
  serverRoles: readonly Role[];
  /** Why the mirror is exact, where the answer is not obvious. */
  note?: string;
}

const GATES: Record<Capability, Gate> = {
  'catalog:browse': {
    endpoint: 'GET /v1/capabilities',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
  },
  'catalog:search': {
    endpoint: 'GET /v1/search',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
  },
  'catalog:edit': {
    endpoint: 'POST/PATCH /v1/capabilities',
    serverRoles: ['admin', 'producer'],
    note: 'require_roles([ROLE_PRODUCER, ROLE_ADMIN]) in capabilities.py.',
  },
  'audit:read': {
    endpoint: 'GET /v1/admin/audit',
    serverRoles: ['auditor'],
    note: 'Auditor by exact match, with no admin bypass. Because the server collapses a principal to exactly one role by precedence admin > producer > consumer > auditor, adding admin here would not widen access — it would only produce a nav entry leading to a 403.',
  },
  'ops:view': {
    endpoint: 'GET /healthz, GET /readyz',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'The probes are unauthenticated, so every role is the honest mirror of "the server checks nothing here". This grouping is a UI decision about where the screens live.',
  },
  'ops:operate': {
    endpoint: 'GET /v1/admin/operational-health',
    serverRoles: ['admin'],
    note: 'Deliberately not ops:view. The probes behind that are unauthenticated; this reports the shared deployment internals and is require_roles([ROLE_ADMIN]).',
  },
  'admin:manage': {
    endpoint: '/v1/admin/* (except audit)',
    serverRoles: ['admin'],
    note: 'One capability for the whole family because the server has one gate for all of it, via _admin_common.py.',
  },
  'adoption:read': {
    endpoint: 'GET /v1/capabilities/{provider_cap_id}/adoptions',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: '_list_adoptions_required admits all four. Split from the write because _adopt_required does not.',
  },
  'adoption:write': {
    endpoint: 'POST /v1/capabilities/{provider_cap_id}/adoptions',
    serverRoles: ['admin', 'producer'],
    note: 'require_roles([ROLE_PRODUCER, ROLE_ADMIN]) in adoptions.py — consumer is excluded outright, which is why this cannot share an entry with the read.',
  },
  'subscription:manage': {
    endpoint: 'GET/POST /v1/capabilities/{capability_id}/subscriptions',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: "Tenant-scoped over the caller's own subscriptions, so get_tenant_context is the whole gate.",
  },
  'notification:read': {
    endpoint: 'GET /v1/notifications',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'get_tenant_context only. Read state is a filter on this list rather than a field, so there is no separate write gate to mirror.',
  },
  'impact:read': {
    endpoint: 'GET /v1/capabilities/{entity_id}/blast-radius',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'get_tenant_context only; the visibility filter decides which edges are returned rather than the role.',
  },
  'memory:read': {
    endpoint: 'GET /v1/memory/claims',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'get_tenant_context only, for every /v1/memory/* route.',
  },
  'usage:read:operator': {
    endpoint: 'GET /v1/admin/usage/summary',
    serverRoles: ['admin'],
    note: '_admin_required in admin_usage.py, for all four aggregate reads. Not ops:view, whose endpoints are unauthenticated probes.',
  },
  'usage:read:owned': {
    endpoint: 'GET /v1/usage/owned-capabilities',
    serverRoles: ['admin', 'producer'],
    note: '_admin_or_producer_required in usage.py — a producer is entitled to usage of what their tenant owns, which is why this cannot share an entry with the operator-scoped reads.',
  },
  'workspace:read': {
    endpoint: 'GET /v1/workspaces',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'require_roles([consumer, producer, admin, auditor]) in workspaces.py — every authenticated actor may call the endpoint, and which rows come back is decided per workspace by the service perceivability rule rather than by the role.',
  },
  'workspace:write:personal': {
    endpoint: 'POST /v1/workspaces (owner_kind=actor)',
    serverPath: '/v1/workspaces',
    serverRoles: ['producer'],
    note: 'The router admits any role, so the gate that matters is in the service: create raises WorkspaceOperationDenied unless the actor holds producer, and _assert_can_update_workspace / _assert_can_delete_workspace / _assert_can_write_entries additionally require the actor to be the owner. Admin is excluded deliberately — an admin cannot write to somebody else\u2019s personal notebook — which is why this cannot share an entry with the team write.',
  },
  'workspace:write:team': {
    endpoint: 'POST /v1/workspaces (owner_kind=tenant)',
    serverPath: '/v1/workspaces',
    serverRoles: ['admin'],
    note: 'Same service gates, other branch: creating, updating, archiving, deleting and writing entries on a tenant-owned workspace all require admin, and a producer is refused.',
  },
  'graph:read': {
    endpoint: 'GET /v1/graph/provider, GET /v1/graph/consumer',
    serverPath: '/v1/graph/provider',
    serverRoles: ['admin', 'producer', 'consumer', 'auditor'],
    note: 'Neither projection route carries require_roles in graph.py — both take Depends(get_tenant_context) only, so any authenticated actor may read their own tenant’s projections. The _admin_required in that module applies to the edge-property-schema routes, which this capability does not cover.',
  },
  'ontology:read': {
    endpoint:
      'GET /v1/admin/vocabularies/{kind}, GET /v1/admin/capability-types, GET /v1/admin/edge-property-schemas',
    serverPath: '/v1/admin/capability-types',
    serverRoles: ['admin'],
    note: 'All three are under the /v1/admin prefix behind _admin_required in _admin_common.py. Separate from admin:manage because it is a read of the schema surface rather than the operator write, and a screen that offered both would ship sync-source controls to a reader who only asked what an edge relation is.',
  },
};

describe('the capability table against the API', () => {
  it('declares a server gate for every capability', () => {
    /*
     * The load-bearing assertion, and the reason the map lives beside the test
     * rather than inside it: a capability added without a gate fails here, which
     * forces whoever adds one to go and read the router. That is the whole
     * mechanism — it makes the question unavoidable at the moment it is
     * cheapest to answer.
     */
    const ungated = ALL_CAPABILITIES.filter((c) => GATES[c] === undefined);
    expect(ungated).toEqual([]);
  });

  it.each(ALL_CAPABILITIES)('grants %s exactly the roles the server admits', (capability) => {
    const uiRoles = [...CAPABILITIES[capability]].sort();
    const serverRoles = [...GATES[capability].serverRoles].sort();
    expect(uiRoles).toEqual(serverRoles);
  });

  it('names an endpoint that exists in the API document', () => {
    /*
     * This used to assert the endpoint string was non-empty, which is a check
     * that any typo passes. The failure it could not see is the one that matters:
     * a capability mirroring a route that was renamed, or never existed, reads as
     * verified coverage while gating nothing. So the path is now resolved against
     * the vendored OpenAPI document — the same document the client is generated
     * from, so a drift between the two is already caught elsewhere.
     *
     * Wildcard families are checked by prefix, because `/v1/admin/*` is a real
     * statement about a real set of routes even though it is not itself a path.
     */
    for (const capability of ALL_CAPABILITIES) {
      const gate = GATES[capability];
      const claimedPaths = gate.serverPath ? [gate.serverPath] : pathsFromEndpoint(gate.endpoint);
      expect(claimedPaths.length, `${capability} names no path`).toBeGreaterThan(0);

      /*
       * Every path, not the first. One gate names two routes — the two probes —
       * and a single-match extraction verified one of them while reporting the
       * whole entry as checked, which is precisely the "reads as verified coverage
       * while gating nothing" failure this test exists to prevent.
       */
      for (const claimed of claimedPaths) {
        if (claimed.endsWith('*')) {
          const prefix = claimed.slice(0, -1);
          const family = SPEC_PATHS.filter((p) => p.startsWith(prefix));

          /*
           * A family gate carved out by its note has to still cover something
           * *other* than the carve-out. Counting the whole prefix would pass even
           * if every route but the excluded one disappeared.
           */
          const excluded = gate.note?.match(/except (\S+)/)?.[1];
          const covered = excluded
            ? family.filter((p) => !p.includes(excluded.replace(/[^a-z-]/g, '')))
            : family;
          expect(
            covered.length,
            `${capability} claims the family ${claimed}, which covers no path beyond its own exclusion`,
          ).toBeGreaterThan(0);
        } else {
          expect(SPEC_PATHS, `${capability} claims ${claimed}`).toContain(claimed);
        }
      }
    }
  });

  it('has no gate for a capability that no longer exists', () => {
    // The reverse drift: a capability removed from the table leaves a gate
    // describing a control the UI no longer offers, which reads as coverage.
    const orphaned = Object.keys(GATES).filter(
      (key) => !ALL_CAPABILITIES.includes(key as Capability),
    );
    expect(orphaned).toEqual([]);
  });
});

describe('the role-collapse trap', () => {
  it('never grants a capability to admin alongside auditor only', () => {
    /*
     * The contextplane resolves a principal to exactly one role by precedence, with
     * auditor lowest. So a capability granted to both admin and auditor is
     * unreachable for anyone holding both — they collapse to admin and lose the
     * auditor grant. `audit:read` is auditor-only for exactly this reason, and
     * this asserts nobody "fixes" it by adding admin.
     */
    for (const capability of ALL_CAPABILITIES) {
      const roles = new Set<Role>(CAPABILITIES[capability]);
      if (roles.has('auditor') && roles.has('admin')) {
        expect(roles.has('producer') && roles.has('consumer')).toBe(true);
      }
    }
  });
});
