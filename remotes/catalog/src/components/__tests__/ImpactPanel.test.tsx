import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ImpactPanel } from '../ImpactPanel';

/**
 * The impact panel, checked on the properties that make it worth trusting.
 *
 * The interesting assertions are not "does it render a list" — they are whether a
 * partial answer admits it, whether an empty result stays ambiguous instead of
 * claiming isolation, and whether only the selected traversal is requested. A
 * panel that walks all three graphs on mount would make opening any capability
 * cost a transitive closure.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

function renderPanel(role: 'consumer' | 'producer' | 'admin' | 'auditor' = 'consumer') {
  return renderWithProviders(<ImpactPanel handle="salt-design-system" />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });
}

describe('the impact panel', () => {
  it('opens on who depends on this, not on what it depends on', async () => {
    /*
     * The default matters. A reader arriving at a capability page is far more
     * often deciding whether changing it is safe than deciding whether to build
     * on it — and the second question is one click away either way.
     */
    renderPanel();
    expect(await screen.findByText('calls')).toBeInTheDocument();
    expect(screen.getByText(/Who needs this capability/)).toBeInTheDocument();
  });

  it('states that a cached closure may be missing a recent edge', async () => {
    // The reader most likely to be here is deciding whether to ship a breaking
    // change, and is the one person who must not be told a partial answer is
    // complete.
    renderPanel();
    expect(await screen.findByText(/cached closure/i)).toBeInTheDocument();
  });

  it('counts the version constraints it could not resolve', async () => {
    renderPanel();
    expect(
      await screen.findByText(/1 version constraint could not be resolved/),
    ).toBeInTheDocument();
  });

  it('groups edges by relationship with a count', async () => {
    renderPanel();
    const label = await screen.findByText('calls');
    // The count sits beside the relationship so a reader can size the group
    // before reading it.
    expect(label.parentElement?.textContent).toMatch(/calls\s*1/);
  });

  it('requests a deeper walk when the depth changes', async () => {
    // Depth is a server-side parameter, so changing it must produce a new request
    // rather than filtering what is already on screen.
    renderPanel();
    await screen.findByText('calls');

    const depth = screen.getByRole('combobox', { name: /hops to follow/i });
    await userEvent.click(depth);
    await userEvent.click(screen.getByRole('option', { name: '2' }));

    // The handler returns a second edge only at depth 2 or more.
    expect(await screen.findByText('trader-workbench-web')).toBeInTheDocument();
  });

  it('does not claim isolation when a traversal comes back empty', async () => {
    /*
     * The load-bearing copy assertion. "No dependents" and "no dependents you can
     * see" are different facts, and the second is the one a reader would otherwise
     * act on — the blast-radius fixture is empty precisely so this is reachable.
     */
    renderPanel();
    await screen.findByText('calls');

    const question = screen.getByRole('combobox', { name: /ask/i });
    await userEvent.click(question);
    await userEvent.click(screen.getByRole('option', { name: 'Blast radius' }));

    const empty = await screen.findByText(/Nothing Connected at This Depth/i);
    expect(empty).toBeInTheDocument();
    expect(screen.getByText(/private to another tenant/i)).toBeInTheDocument();
  });

  it('drops the cache caveat when the response reports none', async () => {
    // The dependencies endpoint reports neither cache state nor version
    // agreement, so relaying a caveat there would be inventing one.
    renderPanel();
    await screen.findByText('calls');

    const question = screen.getByRole('combobox', { name: /ask/i });
    await userEvent.click(question);
    await userEvent.click(screen.getByRole('option', { name: 'Depends on' }));

    expect(await screen.findByText('depends_on')).toBeInTheDocument();
    expect(screen.queryByText(/cached closure/i)).not.toBeInTheDocument();
  });

  it('reads impact for every role the API admits', async () => {
    /*
     * Not narrowed to producers. Knowing what depends on a capability is exactly
     * what a consumer needs before building on it, and the server gates the
     * traversal on a tenant context rather than a role — so the panel mirrors that
     * rather than inventing a boundary.
     */
    const { unmount } = renderPanel('auditor');
    expect(await screen.findByText('calls')).toBeInTheDocument();
    unmount();
  });

  it('renders the edge table with an accessible caption', async () => {
    // Every table in this app carries a caption even when it is visually hidden,
    // because a screen reader landing in a group of tables needs to tell them
    // apart.
    renderPanel();
    await screen.findByText('calls');
    const table = screen.getByRole('table', { name: /Entities related by calls/i });
    expect(within(table).getByText('client-portal-web')).toBeInTheDocument();
  });
});
