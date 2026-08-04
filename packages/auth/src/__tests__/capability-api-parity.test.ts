import { describe, expect, it } from 'vitest';

import { ALL_CAPABILITIES, CAPABILITIES } from '../capabilities';
import type { Capability, Role } from '../index';

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

  it('names a real endpoint for each capability', () => {
    // A gate whose endpoint is blank would satisfy the check above while
    // documenting nothing.
    for (const capability of ALL_CAPABILITIES) {
      expect(GATES[capability].endpoint.length).toBeGreaterThan(0);
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
     * The registry resolves a principal to exactly one role by precedence, with
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
