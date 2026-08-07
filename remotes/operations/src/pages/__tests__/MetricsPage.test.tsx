import { createRegistryClient } from '@knowledge-ui/api-client';
import type { Persona } from '@knowledge-ui/auth';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { OperationalSections } from '../MetricsPage';

/**
 * The page reads one first-party endpoint and nothing else.
 *
 * The assertions that matter are about provenance, not layout. Two earlier
 * versions of this page rendered numbers a reader could not calibrate — one
 * replica's counters presented as the service, then a set of links into a tool
 * that may not be deployed. So what is tested here is that every number arrives
 * with the qualifier that says how far to trust it, and that the page is honest
 * about the one thing it genuinely cannot answer.
 */

/**
 * A real client over MSW, not a stub. The mock resolves the role from the
 * token's `sub` exactly as the entitlement service does, so the admin gate is
 * exercised rather than assumed.
 */
const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderAs = (
  role: 'admin' | 'producer' | 'consumer' | 'auditor',
  extras: { personas?: readonly Persona[]; onSwitchPersona?: (key: string) => void } = {},
) =>
  renderWithProviders(<OperationalSections />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
    ...extras,
  });

describe('as an administrator', () => {
  it('shows queue depths counted across the deployment', async () => {
    renderAs('admin');
    expect(await screen.findByText('Embedding outbox')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('labels cluster-counted and process-local readings differently, once per section', async () => {
    /*
     * The load-bearing assertion. A queue depth is true for the deployment; a
     * data-quality counter is one replica's tally since it restarted. Rendered
     * side by side they are the same shape, so the qualifier is the only thing
     * standing between a reader and a wrong conclusion.
     *
     * Each qualifier is stated once, in its section's description — every
     * reading in each section shares a scope, and a fact repeated under all six
     * tiles becomes chrome the eye stops seeing. The per-tile hint returns only
     * when a section's readings disagree about their scope.
     */
    renderAs('admin');
    await screen.findByText('Embedding outbox');

    expect(screen.getAllByText(/Counted across the deployment/i)).toHaveLength(1);
    expect(screen.getByText(/does not prove zero everywhere/i)).toBeInTheDocument();
  });

  it('names the replica that answered, for process-local counters only', async () => {
    // Without it, two reads that hit different replicas look like a counter
    // that went backwards rather than two different processes.
    renderAs('admin');
    await screen.findByText('Embedding outbox');

    // Stated once, because every counter in that table came from the same
    // replica. Repeating it per row said nothing extra and wrapped three lines
    // deep in a column nobody scans.
    expect(screen.getByText(/registry-7d9f/)).toBeInTheDocument();
    // Never attached to a cluster-counted reading, which belongs to no replica.
    expect(screen.queryByText(/Counted across the deployment.*registry-/)).not.toBeInTheDocument();
  });

  it('says a zero does not prove zero everywhere', async () => {
    renderAs('admin');
    await screen.findByText('Embedding outbox');
    expect(screen.getByText(/does not prove zero everywhere/i)).toBeInTheDocument();
  });

  it('surfaces how many data-quality counters are non-zero', async () => {
    // Each non-zero value means a principal silently resolved to fewer roles
    // than it was granted, so the count is the reason to look at the table.
    renderAs('admin');
    expect(await screen.findByText(/1 counter is non-zero/i)).toBeInTheDocument();
  });

  it('explains why an abandoned delivery matters only when there are any', async () => {
    /*
     * The fixture reports two, so the consequence is shown. Against a zero it
     * must not be: a healthy queue captioned "a subscriber is missing change
     * notifications" states a live failure that is not happening, and an
     * operator who learns to ignore it will ignore the real one too.
     */
    renderAs('admin');
    expect(await screen.findByText(/will never arrive/i)).toBeInTheDocument();

    const healthy = screen.getByText('Embedding outbox').closest('div');
    expect(healthy?.textContent).not.toMatch(/will never arrive/i);
  });

  it('names rates and percentiles as unavailable instead of approximating them', async () => {
    /*
     * The page holds no history, so it cannot compute a rate. Saying so beats
     * deriving one from a single reading, which is what the version that parsed
     * the exposition did.
     */
    renderAs('admin');
    await screen.findByText('Embedding outbox');
    expect(screen.getByText(/no rates or trends are shown/i)).toBeInTheDocument();
  });

  it('renders a seconds-keyed reading as a length of time, not a count', async () => {
    /*
     * The response model carries no unit field; the key suffix is the only
     * signal the server sends. Rendered through the count path, a day-and-a-half
     * age gauge read as a hundred and fifty thousand of something.
     */
    server.use(
      http.get('*/v1/admin/operational-health', () =>
        HttpResponse.json({
          observed_at: '2026-08-03T18:00:00Z',
          queues: [
            {
              key: 'oldest_open_proposal_age_seconds',
              label: 'Oldest open proposal age',
              value: 150604.244,
              scope: 'cluster',
              kind: 'gauge',
              instance: null,
              actionable: null,
            },
          ],
          data_quality: [],
        }),
      ),
    );

    renderAs('admin');
    expect(await screen.findByText('1d 17h')).toBeInTheDocument();
    expect(screen.queryByText(/150,604/)).not.toBeInTheDocument();
  });

  it('names no external dashboard tool as the place to go instead', async () => {
    // The regression test for the second wrong version. A deployment without
    // that tool must not be told to go and use it.
    const { container } = renderAs('admin');
    await screen.findByText('Embedding outbox');
    // operational-data-source: intentional — naming the tool is the assertion.
    expect(container.textContent?.toLowerCase()).not.toContain('grafana'); // operational-data-source: intentional
  });
});

describe('as any other role', () => {
  it.each(['producer', 'consumer', 'auditor'] as const)(
    'explains the restriction to a %s rather than showing an error',
    async (role) => {
      /*
       * The server gates this on admin. Asking anyway would render a 403 as a
       * failure the reader could act on, when the honest answer is that this
       * summary is not theirs to see. The refusal names the role that can act,
       * in the same boxed idiom every gated section uses.
       */
      renderAs(role);
      await waitFor(() =>
        expect(screen.getByText(/read with the admin role only/i)).toBeInTheDocument(),
      );
      expect(screen.queryByText('Embedding outbox')).not.toBeInTheDocument();
    },
  );

  it('offers the persona that would succeed, when the roster has one', async () => {
    // The refusal's next step is a control, not a sentence pointing elsewhere.
    const onSwitchPersona = vi.fn();
    renderAs('consumer', {
      personas: [
        {
          key: 'admin',
          label: 'Platform — Admin',
          description: '',
          clientId: 'knowledge-ui-admin',
          clientSecret: '',
          entitlements: [],
          expectedRole: 'admin',
        },
      ],
      onSwitchPersona,
    });

    const button = await screen.findByRole('button', { name: /Switch to Platform — Admin/ });
    button.click();
    expect(onSwitchPersona).toHaveBeenCalledWith('admin');
  });
});
