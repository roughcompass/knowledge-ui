import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyncRunsPage } from '../SyncRunsPage';

/**
 * The runs list, checked on what a reader takes away at a glance: how long a
 * run took as a length of time, what window they are looking at, and that a
 * failure's detail opens where the failure is.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPage = () =>
  renderWithProviders(<SyncRunsPage />, {
    session: makeSession({ role: 'admin', personaKey: 'admin' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-admin'),
    }),
  });

describe('the window', () => {
  it('says the list is a window onto more, in one plain sentence', async () => {
    renderPage();
    expect(
      await screen.findByText(
        'Connector runs from the last 7 days, newest first — older runs exist but are not shown.',
      ),
    ).toBeInTheDocument();
  });
});

describe('durations', () => {
  it('renders a duration as a length of time with units', async () => {
    // 72 raw seconds reads as a count; "1m 12s" answers how long it took.
    renderPage();
    expect(await screen.findByText('1m 12s')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /connector runs/i });
    expect(within(table).getByText('53s')).toBeInTheDocument();
    // Null still means "still running", which is not zero seconds.
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('the failure detail', () => {
  it('expands beneath the clicked run, inside the table', async () => {
    /*
     * The connector's report used to render in a card below the whole table,
     * detached from the run it described. It now occupies a full-width row
     * directly under the entry the reader clicked.
     */
    renderPage();
    const show = (await screen.findAllByRole('button', { name: 'Show' }))[0]!;
    const table = screen.getByRole('table', { name: /connector runs/i });
    const summary = '3 artifacts could not be parsed and were skipped';
    expect(within(table).queryByText(summary)).not.toBeInTheDocument();

    fireEvent.click(show);

    expect(within(table).getByText(summary)).toBeInTheDocument();
    expect(within(table).getByText(/Reported by the connector/)).toBeInTheDocument();

    fireEvent.click(within(table).getAllByRole('button', { name: 'Hide' })[0]!);
    expect(within(table).queryByText(summary)).not.toBeInTheDocument();
  });
});
