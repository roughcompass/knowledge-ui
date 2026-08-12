import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppFrame } from '../AppFrame';

/**
 * The breadcrumb is a location readout, and these are the two ways it lied: a
 * refused page was filed under the section's index (because the resolver only saw
 * the capability-filtered contextplane), and an entity leaf showed its raw 36-character
 * UUID even while the page below it had the display name on screen.
 */

const FULL_UUID = 'd3a3c68e-1cb4-424d-9b0f-9dba039cec64';

function neverCalledClient(): { client: RegistryClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn((path: string) => Promise.reject(new Error(`unexpected request: ${path}`)));
  return { client: { request } as unknown as RegistryClient, request };
}

function renderFrame(session: Session, client: RegistryClient, route: string) {
  renderWithProviders(
    <Routes>
      <Route
        element={
          <AppFrame
            session={session}
            personas={[]}
            onSwitchPersona={() => {}}
            mode="light"
            onToggleMode={() => {}}
            readiness="ready"
            client={client}
          />
        }
      >
        <Route path="*" element={<div>page body</div>} />
      </Route>
    </Routes>,
    { route, session },
  );
}

function crumb(): HTMLElement {
  return screen.getByRole('list', { name: 'Location' });
}

describe('placement', () => {
  it('belongs to the main content rather than the persistent shell header', () => {
    const session = makeSession({ role: 'consumer', personaKey: 'consumer' });
    renderFrame(session, neverCalledClient().client, '/catalog/claims');

    const trail = crumb();
    expect(within(screen.getByRole('main')).getByRole('list', { name: 'Location' })).toBe(trail);
    expect(trail.closest('header')).toBeNull();
  });
});

describe('page segments on refused routes', () => {
  it('names the audit log for a consumer instead of filing it under Health', () => {
    const session = makeSession({ role: 'consumer', personaKey: 'consumer' });
    renderFrame(session, neverCalledClient().client, '/ops/audit');

    const trail = crumb();
    expect(within(trail).getByText('Operations')).toBeInTheDocument();
    expect(within(trail).getByText('Audit Log')).toBeInTheDocument();
    // The raw path fragment and the wrong owner are both gone.
    expect(within(trail).queryByText('audit')).not.toBeInTheDocument();
    expect(within(trail).queryByText('Health')).not.toBeInTheDocument();
    // A readout, not an invitation: the refused page's crumb is not a link.
    expect(within(trail).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('entity leaves', () => {
  it('resolves a workspace UUID to its name, through the shared query cache', async () => {
    const session = makeSession({ role: 'admin', personaKey: 'admin' });
    let resolveWorkspace: (value: unknown) => void = () => {};
    const client = {
      request: vi.fn((path: string) => {
        if (path === `/v1/workspaces/${FULL_UUID}`) {
          return new Promise((resolve) => {
            resolveWorkspace = resolve;
          });
        }
        throw new Error(`unexpected request: ${path}`);
      }),
    } as unknown as RegistryClient;

    renderFrame(session, client, `/catalog/workspaces/${FULL_UUID}`);

    // While the name is on its way, the short face — never the full UUID.
    const trail = crumb();
    expect(within(trail).getByText('d3a3c68e')).toBeInTheDocument();
    expect(within(trail).queryByText(FULL_UUID)).not.toBeInTheDocument();

    resolveWorkspace({
      workspace_id: FULL_UUID,
      tenant_id: 't1',
      name: 'Walkthrough notes',
      owner_kind: 'team',
      created_at: '2026-08-07T12:19:23Z',
      updated_at: '2026-08-07T12:19:23Z',
    });

    expect(await within(trail).findByText('Walkthrough notes')).toBeInTheDocument();
    expect(within(trail).queryByText(FULL_UUID)).not.toBeInTheDocument();
    // The page segment above the entity is the way up, so it is a link.
    expect(within(trail).getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
  });

  it('shows the short id for a claim, which is id-only by design, without fetching', () => {
    const session = makeSession({ role: 'admin', personaKey: 'admin' });
    const { client, request } = neverCalledClient();
    renderFrame(session, client, '/catalog/claims/05115d73-7c3e-435a-a855-3dd012e8a538');

    const trail = crumb();
    expect(within(trail).getByText('05115d73')).toBeInTheDocument();
    expect(
      within(trail).queryByText('05115d73-7c3e-435a-a855-3dd012e8a538'),
    ).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('leaves a human-readable capability slug alone, without fetching', () => {
    const session = makeSession({ role: 'admin', personaKey: 'admin' });
    const { client, request } = neverCalledClient();
    renderFrame(session, client, '/catalog/salt-design-system');

    const trail = crumb();
    expect(within(trail).getByText('salt-design-system')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
