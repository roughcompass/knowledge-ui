import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeAuditRow, makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { fireEvent, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { AuditLogPage } from '../AuditLogPage';

/**
 * The audit log, checked on the two questions its reader brings: who did each
 * thing, and what changed. Both used to be answered somewhere other than the
 * row — the actor nowhere at all, the change below the whole table.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPage = () =>
  renderWithProviders(<AuditLogPage />, {
    session: makeSession({ role: 'auditor', personaKey: 'auditor' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-auditor'),
    }),
  });

describe('the actor', () => {
  it('shows who performed each change', async () => {
    /*
     * The server sends actor_id on every row; the page used to drop it, which
     * left an audit log that never said who did anything. The rendered value is
     * clickable copy-equipped identity, not a bare cell.
     */
    renderPage();
    const actors = await screen.findAllByRole('button', { name: /^actor-0000/ });
    expect(actors.length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: /audit entries/i });
    expect(within(table).getByRole('columnheader', { name: 'Actor' })).toBeInTheDocument();
  });

  it('fills the actor filter when an actor is clicked', async () => {
    // The filter demands an actor id, and the rows are the only place on the
    // page that id can be discovered.
    renderPage();
    const actorButton = (await screen.findAllByRole('button', { name: /^actor-0000/ }))[0]!;
    const actorId = actorButton.textContent ?? '';

    fireEvent.click(actorButton);

    expect(screen.getByPlaceholderText('actor id')).toHaveValue(actorId);
  });

  it('renders an unrecorded actor as an em dash, not an empty cell', async () => {
    server.use(
      http.get('*/v1/admin/audit', () =>
        HttpResponse.json({ items: [makeAuditRow({ actor_id: null })], next_cursor: null }),
      ),
    );

    renderPage();
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: /audit entries/i });
    expect(within(table).queryByRole('button', { name: /^actor-0000/ })).not.toBeInTheDocument();
  });
});

describe('the change detail', () => {
  it('expands beneath the clicked row, inside the table', async () => {
    /*
     * The diff used to render below the whole table, so for any visible row the
     * expansion landed off-screen and Show appeared to do nothing. It now
     * occupies a full-width row directly under the entry it belongs to.
     */
    renderPage();
    const show = (await screen.findAllByRole('button', { name: 'Show' }))[0]!;
    const table = screen.getByRole('table', { name: /audit entries/i });
    expect(within(table).queryByText('lifecycle')).not.toBeInTheDocument();

    fireEvent.click(show);

    expect(within(table).getAllByText('lifecycle').length).toBeGreaterThan(0);
    expect(within(table).getByText('beta')).toBeInTheDocument();
    expect(within(table).getByText('ga')).toBeInTheDocument();
    // The detached below-the-table panel and its anonymous trigger are gone.
    expect(screen.queryByText('Change Detail')).not.toBeInTheDocument();

    fireEvent.click(within(table).getAllByRole('button', { name: 'Hide' })[0]!);
    expect(within(table).queryByText('lifecycle')).not.toBeInTheDocument();
  });
});
