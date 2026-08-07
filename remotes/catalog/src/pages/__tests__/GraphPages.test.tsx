import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphDashboardPage } from '../GraphDashboardPage';
import { GraphOntologyPage } from '../GraphOntologyPage';
import { GraphProjectionsPage } from '../GraphProjectionsPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

type Role = 'producer' | 'admin' | 'consumer' | 'auditor';

const renderAs = (page: React.ReactElement, role: Role) =>
  renderWithProviders(page, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });

/**
 * The tests that matter here are about what the page refuses to say.
 *
 * The graph is the surface most likely to grow an invented number — a triple
 * count is the first thing anybody asks a graph dashboard for, and nothing in
 * the API serves one. So the first block below asserts the absence, not just the
 * presence: that no total appears, and that the counts which *do* appear are
 * labelled as pages or as definitions rather than as populations.
 */
describe('the totals the registry does not serve', () => {
  it('names the absence of graph totals instead of computing one', async () => {
    renderAs(<GraphDashboardPage />, 'admin');
    expect(await screen.findByText('Graph totals')).toBeInTheDocument();
    expect(screen.getByText(/No endpoint counts the graph/)).toBeInTheDocument();
  });

  it('labels projection counts as a page, so a reader cannot read them as a size', async () => {
    renderAs(<GraphDashboardPage />, 'consumer');
    // Both panels, so the assertion covers the second one too rather than
    // passing on whichever resolved first.
    await screen.findByText('What this tenant consumes');
    expect(await screen.findAllByText('Entities on the first page')).toHaveLength(2);
    expect(screen.getAllByText('Edges on the first page')).toHaveLength(2);
    // The bare words would be the claim this page must never make.
    expect(screen.queryByText('Entities')).not.toBeInTheDocument();
  });

  it('says the ontology counts are definitions rather than instances', async () => {
    renderAs(<GraphDashboardPage />, 'admin');
    expect(await screen.findByText('Entity types')).toBeInTheDocument();
    expect(screen.getByText(/Definitions, not instances/)).toBeInTheDocument();
  });
});

describe('the two gates, mirrored separately', () => {
  it('shows a consumer the projections, because both endpoints admit every role', async () => {
    renderAs(<GraphDashboardPage />, 'consumer');
    expect(await screen.findByText('What this tenant ships')).toBeInTheDocument();
    expect(screen.getByText('What this tenant consumes')).toBeInTheDocument();
  });

  it('names the ontology as unreadable for a non-admin rather than offering a refusal', async () => {
    renderAs(<GraphDashboardPage />, 'consumer');
    await screen.findByText('What this tenant ships');
    expect(screen.getByText(/requires the admin role/)).toBeInTheDocument();
    // No count is shown alongside the notice — an incomplete panel would be worse
    // than an absent one.
    expect(screen.queryByText('Edge relations')).not.toBeInTheDocument();
  });

  it('shows an admin the ontology counts', async () => {
    renderAs(<GraphDashboardPage />, 'admin');
    expect(await screen.findByText('Edge relations')).toBeInTheDocument();
    expect(screen.getByText('Capability type schemas')).toBeInTheDocument();
  });
});

describe('the ontology page', () => {
  it('lists deprecated relations rather than filtering them out', async () => {
    renderAs(<GraphOntologyPage />, 'admin');
    expect(await screen.findByText('related_to')).toBeInTheDocument();
    expect(screen.getByText(/^Deprecated /)).toBeInTheDocument();
  });

  it('distinguishes an enforced schema from an advisory one', async () => {
    renderAs(<GraphOntologyPage />, 'admin');
    expect(await screen.findByText('Enforced')).toBeInTheDocument();
    expect(screen.getAllByText('Advisory').length).toBeGreaterThan(0);
  });

  it('says the two vocabularies it reads are a chosen pair, not the whole set', async () => {
    renderAs(<GraphOntologyPage />, 'admin');
    expect(await screen.findByText(/Two vocabularies, not every vocabulary/)).toBeInTheDocument();
  });
});

describe('the projections page', () => {
  it('renders the roster the rest of the app shows, not a graph-only cast', async () => {
    renderAs(<GraphProjectionsPage />, 'producer');
    // More than one: the node table links it, and now so does every edge endpoint
    // that resolves to it — the multiplicity is the feature under test.
    expect((await screen.findAllByRole('link', { name: 'salt-design-system' })).length).toBeGreaterThan(0);
  });

  it('shows an unresolved edge target as its id instead of dropping the edge', async () => {
    renderAs(<GraphProjectionsPage />, 'producer');
    await screen.findAllByRole('link', { name: 'salt-design-system' });
    // Every edge on the page is rendered; the ones pointing past it keep the id.
    expect(screen.getByText('Edges')).toBeInTheDocument();
  });

  it('offers a next page without claiming how many pages there are', async () => {
    renderAs(<GraphProjectionsPage />, 'producer');
    expect(await screen.findByRole('button', { name: /Next/ })).toBeEnabled();
    expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();
  });
});
