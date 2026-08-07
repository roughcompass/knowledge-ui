// @vitest-environment jsdom
/**
 * The refusal screen's contract: it names the roles that would work, offers a
 * switch only to a persona that would succeed, and explains the role-collapse
 * rule only to the reader it is about. This workspace runs its tests in node,
 * so this file asks for jsdom itself — the component is the one piece of this
 * package that renders.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequireCapability } from '../RequireCapability';
import type { Persona } from '../personaRoster';
import type { Role, Session } from '../types';

afterEach(cleanup);

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

const persona = (key: string, expectedRole: Role): Persona => ({
  key,
  label: `Tenant — ${key}`,
  description: '',
  clientId: `client-${key}`,
  clientSecret: '',
  entitlements: ['dev'],
  expectedRole,
});

describe('RequireCapability', () => {
  it('renders the children when the session holds the capability', () => {
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('auditor')}
        personas={[]}
      >
        <span>the audit table</span>
      </RequireCapability>,
    );

    expect(screen.queryByText('the audit table')).not.toBeNull();
    expect(screen.queryByText('Not available to this role')).toBeNull();
  });

  it('refuses with the destination as the heading and the roles that would work', () => {
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('consumer')}
        personas={[]}
      >
        <span>the audit table</span>
      </RequireCapability>,
    );

    expect(screen.queryByRole('heading', { level: 1, name: 'Audit log' })).not.toBeNull();
    expect(screen.queryByText(/needs the auditor role/)).not.toBeNull();
    expect(screen.queryByText('the audit table')).toBeNull();
  });

  it('explains the role-collapse rule to an administrator, whose refusal it is about', () => {
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('admin')}
        personas={[]}
      >
        <span />
      </RequireCapability>,
    );

    expect(screen.queryByText(/an administrator is refused here by design/)).not.toBeNull();
  });

  it('spares every other role somebody else’s explanation', () => {
    // "Why an administrator is refused" shown to a consumer describes a session
    // they are not holding, and reads as a non sequitur.
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('consumer')}
        personas={[]}
      >
        <span />
      </RequireCapability>,
    );

    expect(screen.queryByText(/an administrator is refused here by design/)).toBeNull();
  });

  it('offers the switch only to a persona that would succeed', () => {
    const onSwitchPersona = vi.fn();
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('consumer')}
        personas={[persona('consumer', 'consumer'), persona('auditor', 'auditor')]}
        onSwitchPersona={onSwitchPersona}
      >
        <span />
      </RequireCapability>,
    );

    const button = screen.getByRole('button', { name: 'Switch to Tenant — auditor' });
    button.click();
    expect(onSwitchPersona).toHaveBeenCalledWith('auditor');
  });

  it('offers no switch when no persona would succeed', () => {
    render(
      <RequireCapability
        need="audit:read"
        screen="Audit log"
        session={sessionWith('consumer')}
        personas={[persona('consumer', 'consumer')]}
        onSwitchPersona={vi.fn()}
      >
        <span />
      </RequireCapability>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
