import { describe, expect, it } from 'vitest';

import { CAPABILITIES, can, capabilitiesFor, rolesGranting } from '../capabilities';
import { PERSONA_ROSTER } from '../personaRoster';
import { ROLES, isRole, toSession, type Role, type Session, type WhoamiResponse } from '../types';

const sessionWith = (role: Role): Session => ({
  actorId: 'a',
  actorDisplayName: null,
  actorEmail: null,
  tenantId: 't',
  tenantSlug: 'dev',
  tenantDisplayName: 'Dev',
  role,
  personaKey: role,
});

describe('can()', () => {
  it('lets every role browse the catalog', () => {
    for (const role of ROLES) expect(can(sessionWith(role), 'catalog:browse')).toBe(true);
  });

  it('restricts editing to admin and producer', () => {
    expect(can(sessionWith('admin'), 'catalog:edit')).toBe(true);
    expect(can(sessionWith('producer'), 'catalog:edit')).toBe(true);
    expect(can(sessionWith('consumer'), 'catalog:edit')).toBe(false);
    expect(can(sessionWith('auditor'), 'catalog:edit')).toBe(false);
  });

  it('grants audit:read to the auditor and to nobody else', () => {
    expect(can(sessionWith('auditor'), 'audit:read')).toBe(true);
    for (const role of ['admin', 'producer', 'consumer'] as const) {
      expect(can(sessionWith(role), 'audit:read')).toBe(false);
    }
  });

  it('does NOT grant audit:read to admin', () => {
    // Not a UI policy choice. The server guards the audit endpoint with an exact
    // auditor check and collapses a principal's grants to one role by
    // precedence, so an admin+auditor principal resolves to admin and is
    // refused. Adding admin here would produce a nav entry leading to a 403.
    expect(rolesGranting('audit:read')).toEqual(['auditor']);
    expect(can(sessionWith('admin'), 'audit:read')).toBe(false);
  });

  it('is false for a missing session rather than throwing', () => {
    expect(can(null, 'catalog:browse')).toBe(false);
    expect(can(undefined, 'ops:view')).toBe(false);
  });
});

describe('capabilitiesFor()', () => {
  it('reports what a role unlocks', () => {
    expect(capabilitiesFor('auditor')).toContain('audit:read');
    expect(capabilitiesFor('consumer')).not.toContain('audit:read');
    expect(capabilitiesFor('consumer')).toContain('catalog:browse');
  });
});

describe('the capability table itself', () => {
  it('lists only known roles', () => {
    for (const [capability, roles] of Object.entries(CAPABILITIES)) {
      for (const role of roles) {
        expect(isRole(role), `${capability} lists an unknown role "${role}"`).toBe(true);
      }
    }
  });

  it('has no capability nobody can reach', () => {
    for (const [capability, roles] of Object.entries(CAPABILITIES)) {
      expect(roles.length, `${capability} is unreachable`).toBeGreaterThan(0);
    }
  });
});

describe('the persona roster', () => {
  it('has unique keys and unique client ids', () => {
    const keys = PERSONA_ROSTER.map((p) => p.key);
    const ids = PERSONA_ROSTER.map((p) => p.clientId);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only claims roles the app knows', () => {
    for (const p of PERSONA_ROSTER) expect(isRole(p.expectedRole)).toBe(true);
  });

  it('ships exactly one auditor persona', () => {
    // The audit log is unreachable without one, and two would be confusing
    // rather than useful.
    expect(PERSONA_ROSTER.filter((p) => p.expectedRole === 'auditor')).toHaveLength(1);
  });

  it('gives every persona at least one entitlement', () => {
    // A persona with no grants resolves to a bare 403 at whoami, which reads as
    // a broken app rather than a misconfigured fixture.
    for (const p of PERSONA_ROSTER) expect(p.entitlements.length).toBeGreaterThan(0);
  });

  it('has a persona with more than one grant, to exercise tenant selection', () => {
    expect(PERSONA_ROSTER.some((p) => p.entitlements.length > 1)).toBe(true);
  });
});

describe('toSession()', () => {
  const whoami: WhoamiResponse = {
    actor_id: 'actor-1',
    actor_display_name: 'Dev Admin',
    actor_email: null,
    tenant_id: 'tenant-1',
    tenant_slug: 'dev',
    tenant_display_name: 'Local Development Tenant',
    roles: ['admin'],
  };

  it('builds a session from the fields that arrived', () => {
    expect(toSession(whoami, 'admin')).toMatchObject({
      actorId: 'actor-1',
      role: 'admin',
      tenantSlug: 'dev',
      personaKey: 'admin',
    });
  });

  it('tolerates the optional fields being absent entirely', () => {
    // The server serialises this model with unset fields excluded, so these are
    // missing keys rather than nulls.
    expect(() => toSession(whoami, 'admin')).not.toThrow();
    expect(whoami).not.toHaveProperty('_links');
  });

  it('throws on a role the UI does not know', () => {
    // Guessing would mean rendering a permission set the server disagrees with.
    expect(() => toSession({ ...whoami, roles: ['superuser'] }, 'x')).toThrow(/no usable role/);
    expect(() => toSession({ ...whoami, roles: [] }, 'x')).toThrow(/no usable role/);
  });
});
