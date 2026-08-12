import type { RegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../DashboardPage';

/**
 * The dashboard's aggregate row, its role-varying cards, and its link register.
 *
 * Everything here renders through a stubbed client rather than MSW, because each
 * assertion is about how one served payload reaches the screen — which readings
 * compete for a tile, where a window is stated, which card a role is shown — and a
 * stub makes the payload the test's own statement rather than a fixture's.
 */

function stubClient(routes: Record<string, unknown>): RegistryClient {
  return {
    request: vi.fn((path: string) => {
      for (const [prefix, payload] of Object.entries(routes)) {
        if (path.startsWith(prefix)) return Promise.resolve(payload);
      }
      return Promise.reject(new Error(`unstubbed request: ${path}`));
    }),
  } as unknown as RegistryClient;
}

const WINDOW = { start: '2026-07-09', end: '2026-08-07' };

function adminRoutes(overrides: Record<string, unknown> = {}) {
  return {
    '/v1/admin/usage/summary': {
      ...WINDOW,
      days: 30,
      surfaces: [{ surface: 'catalog', calls: 374, error_calls: 17, ok_calls: 357 }],
    },
    '/v1/usage/owned-capabilities': {
      ...WINDOW,
      capabilities: [
        { capability_id: 'c1', name: 'ledger', calls: 10, error_calls: 0, ok_calls: 10 },
      ],
    },
    '/v1/admin/operational-health': {
      observed_at: '2026-08-07T12:00:00Z',
      queues: [
        {
          key: 'outbox_depth',
          label: 'Outbox depth',
          value: 4,
          scope: 'cluster',
          kind: 'gauge',
          instance: null,
          actionable: null,
        },
        {
          key: 'oldest_open_proposal_age_seconds',
          label: 'Oldest open promotion proposal, age',
          value: 150582.726,
          scope: 'cluster',
          kind: 'gauge',
          instance: null,
          actionable: null,
        },
      ],
      data_quality: [],
    },
    '/v1/notifications': { items: [], next_cursor: null },
    ...overrides,
  };
}

function renderDashboard(role: 'admin' | 'auditor' | 'consumer', routes: Record<string, unknown>) {
  const session = makeSession({ role, personaKey: role });
  renderWithProviders(
    <DashboardPage session={session} personas={[]} client={stubClient(routes)} readiness="ready" />,
    { session },
  );
}

describe('the Deepest Queue tile', () => {
  it('competes only among queue depths, never seconds-valued ages', async () => {
    renderDashboard('admin', adminRoutes());

    // The age gauge (150,582.726 seconds) is the biggest number in the snapshot;
    // the deepest actual queue is 4. The tile must report the queue.
    expect(await screen.findByText('Deepest Queue')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByText('150,582.726')).not.toBeInTheDocument();
    expect(screen.queryByText('150,583')).not.toBeInTheDocument();
  });

  it('rounds a float-noise depth to a whole number', async () => {
    renderDashboard(
      'admin',
      adminRoutes({
        '/v1/admin/operational-health': {
          observed_at: '2026-08-07T12:00:00Z',
          queues: [
            {
              key: 'outbox_depth',
              label: 'Outbox depth',
              value: 1234.567,
              scope: 'cluster',
              kind: 'gauge',
              instance: null,
              actionable: null,
            },
          ],
          data_quality: [],
        },
      }),
    );

    expect(await screen.findByText('1,235')).toBeInTheDocument();
  });

  it('is absent rather than zero when the snapshot carries no depth readings', async () => {
    renderDashboard(
      'admin',
      adminRoutes({
        '/v1/admin/operational-health': {
          observed_at: '2026-08-07T12:00:00Z',
          queues: [
            {
              key: 'oldest_open_proposal_age_seconds',
              label: 'Oldest open promotion proposal, age',
              value: 150582.726,
              scope: 'cluster',
              kind: 'gauge',
              instance: null,
              actionable: null,
            },
          ],
          data_quality: [],
        },
      }),
    );

    await screen.findByText('Calls');
    expect(screen.queryByText('Deepest Queue')).not.toBeInTheDocument();
  });
});

describe('the usage window', () => {
  it('is stated once under the heading when both endpoints report the same window', async () => {
    renderDashboard('admin', adminRoutes());

    expect(
      await screen.findByText(
        'Usage figures cover 2026-07-09 to 2026-08-07, the window the service reports.',
      ),
    ).toBeInTheDocument();
    // Once per view: the tiles drop the dates their shared line now carries.
    expect(screen.getByText('Summed across every surface.')).toBeInTheDocument();
    expect(screen.getAllByText(/2026-07-09 to 2026-08-07/)).toHaveLength(1);
  });

  it('stays on each tile when the two endpoints disagree', async () => {
    renderDashboard(
      'admin',
      adminRoutes({
        '/v1/usage/owned-capabilities': {
          start: '2026-06-01',
          end: '2026-07-01',
          capabilities: [
            { capability_id: 'c1', name: 'ledger', calls: 10, error_calls: 0, ok_calls: 10 },
          ],
        },
      }),
    );

    // The owned tile is the later of the two responses, so waiting for its hint
    // means both windows are on screen before anything is asserted absent.
    expect(
      await screen.findByText(/complete rather than paged\. 2026-06-01 to 2026-07-01\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Usage figures cover/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Summed across every surface, 2026-07-09 to 2026-08-07\./),
    ).toBeInTheDocument();
  });
});

describe('what each role is offered', () => {
  it('gives the auditor a trail heading, an audit card, and a reading-voice notes card', async () => {
    renderDashboard('auditor', { '/v1/notifications': { items: [], next_cursor: null } });

    // No aggregate read is granted, so no figure is promised.
    expect(
      await screen.findByRole('heading', { name: 'Pick up where you left off' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();

    expect(screen.getByText('Review what changed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Audit Log' })).toBeInTheDocument();

    // `workspace:write:*` is producer-or-admin, so the notes card promises reading.
    expect(screen.getByText("Read your tenant's notes")).toBeInTheDocument();
    expect(screen.queryByText('Keep your own notes')).not.toBeInTheDocument();
  });

  it('keeps the writing-voice notes card and no audit card for an admin', async () => {
    renderDashboard('admin', adminRoutes());

    expect(await screen.findByText('At a glance')).toBeInTheDocument();
    expect(screen.getByText('Keep your own notes')).toBeInTheDocument();
    // Role collapse: audit:read is the auditor's alone, so no admin audit card.
    expect(screen.queryByText('Open Audit Log')).not.toBeInTheDocument();
  });
});

describe('the page-level destinations', () => {
  it('keeps claims and capabilities as distinct real links', async () => {
    renderDashboard('consumer', { '/v1/notifications': { items: [], next_cursor: null } });

    expect(await screen.findByRole('link', { name: /review claims/i })).toHaveAttribute(
      'href',
      '/catalog/claims',
    );
    expect(screen.getByRole('link', { name: /open catalog/i })).toHaveAttribute('href', '/catalog');
  });

  it('uses the reference greeting hierarchy and keeps feature cards border-consistent', async () => {
    renderDashboard('consumer', { '/v1/notifications': { items: [], next_cursor: null } });

    expect(await screen.findByText('Global context')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /good (morning|afternoon|evening)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All context is consolidated for Local Development Tenant/),
    ).toBeInTheDocument();

    const actionCenter = screen.getByText('Action center').closest('.saltCard');
    expect(actionCenter?.className).not.toMatch(/accentTop/);
  });
});

describe('the publish panel links', () => {
  it('renders each owned capability as an accent link', async () => {
    renderDashboard('admin', adminRoutes());

    const link = await screen.findByRole('link', { name: 'ledger' });
    expect(link.className).toMatch(/accent/);
  });
});
