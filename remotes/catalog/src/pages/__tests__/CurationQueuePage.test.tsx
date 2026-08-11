import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurationQueuePage } from '../CurationQueuePage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPage = () =>
  renderWithProviders(<CurationQueuePage />, {
    session: makeSession({ role: 'admin', personaKey: 'admin' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-admin'),
    }),
  });

describe('the curation queue', () => {
  it('leads the read-only note with what the reader can do', async () => {
    /*
     * The refusal is real — the queue's write actions do not exist yet — but the
     * sentence a steward needs first is what this page does give them. The
     * why-not lives beside the note in the source, not on the screen.
     */
    renderPage();
    expect(await screen.findByText('Read-only view')).toBeInTheDocument();
    expect(
      screen.getByText(/You can read everything waiting here and open each claim/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/offered and refused by the server/)).not.toBeInTheDocument();
  });

  it('links each queued claim into its detail', async () => {
    renderPage();
    // The row content, not the table: the loading skeleton renders a table of
    // its own, and asserting against that one proves nothing about the rows.
    const row = (await screen.findByText('system:github/unknown-repo')).closest('tr');
    if (!row) throw new Error('queued claim row missing');
    expect(within(row).getByRole('link')).toBeInTheDocument();
  });
});
