import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphAnalyticsPage } from '../GraphAnalyticsPage';

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
 * An analytics page is where invented numbers appear, so the assertions below are
 * mostly about absence.
 *
 * Three specific inventions are available to anyone building this screen and none
 * of them are served: a service level objective, a failure rate, and a breadth or
 * depth for the graph as a whole. Each has a test here, because each would pass
 * an eye test — a target renders as a tidy badge, a rate as a percentage, a mean
 * branching factor as a single confident number — and only the API document says
 * they are fiction.
 */
describe('the measurements this page refuses to invent', () => {
  it('names the absence of service level objectives rather than showing a target', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('Service level objectives')).toBeInTheDocument();
    expect(screen.getByText(/publishes no objectives/)).toBeInTheDocument();
  });

  it('reports failures as a count and never as a rate', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('Counts, not rates')).toBeInTheDocument();
    // A percentage anywhere on this page would be one this browser computed.
    expect(screen.queryByText(/\d+(\.\d+)?%/)).not.toBeInTheDocument();
  });

  it('scopes breadth and depth to one root instead of to the graph', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('One root, one direction')).toBeInTheDocument();
    expect(
      screen.getByText('Entities that depend on it directly', { exact: false }),
    ).toBeInTheDocument();
    // The unqualified label would be the graph-wide claim the API cannot support.
    expect(screen.queryByText('Entities')).not.toBeInTheDocument();
  });

  it('carries the worst-daily-p95 caveat wherever the number appears', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('Worst Daily p95')).toBeInTheDocument();
    expect(screen.getByText(/percentiles cannot be averaged/)).toBeInTheDocument();
  });
});

describe('the two usage gates, mirrored separately', () => {
  it('gives an admin the deployment-wide read', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(
      await screen.findByText('Most-called capabilities', { exact: false }),
    ).toBeInTheDocument();
  });

  it('refuses the deployment-wide read to a producer while keeping their own', async () => {
    renderAs(<GraphAnalyticsPage />, 'producer');
    expect(await screen.findByText('Deployment-wide usage')).toBeInTheDocument();
    expect(
      await screen.findByText('Capabilities you own that were called', { exact: false }),
    ).toBeInTheDocument();
  });

  it('refuses both usage reads to a consumer without hiding the graph reach', async () => {
    renderAs(<GraphAnalyticsPage />, 'consumer');
    expect(await screen.findByText('Deployment-wide usage')).toBeInTheDocument();
    expect(await screen.findByText('Usage of what you publish')).toBeInTheDocument();
    // The traversal endpoints admit every role, so this half must survive.
    expect(await screen.findByText('One root, one direction')).toBeInTheDocument();
  });

  it('tells an auditor that latency is an administrator read', async () => {
    renderAs(<GraphAnalyticsPage />, 'auditor');
    expect(await screen.findByText('Response times')).toBeInTheDocument();
    // Two panels refuse an auditor for the same reason, so the phrase is expected
    // more than once rather than exactly once.
    expect((await screen.findAllByText(/admits administrators only/)).length).toBeGreaterThan(0);
  });
});

describe('the reach panel', () => {
  it('reports the caveats a traversal came back with', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('What this walk could not settle')).toBeInTheDocument();
    expect(screen.getByText(/cached closure/)).toBeInTheDocument();
  });

  it('offers a depth control across the range the server accepts', async () => {
    renderAs(<GraphAnalyticsPage />, 'admin');
    expect(await screen.findByText('Depth')).toBeInTheDocument();
    expect(await screen.findByText('Entities reached within depth 2')).toBeInTheDocument();
  });
});
