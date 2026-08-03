import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders, resetConsumerStore } from '@knowledge-ui/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationsPage } from '../NotificationsPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPage = () =>
  renderWithProviders(<NotificationsPage />, {
    session: makeSession({ role: 'consumer', personaKey: 'consumer' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-consumer'),
    }),
  });

beforeEach(() => {
  resetConsumerStore();
});

describe('the inbox', () => {
  it('lists unread notifications by default', async () => {
    renderPage();
    expect(await screen.findByText('salt-ds')).toBeInTheDocument();
    expect(screen.getByText('payments-api')).toBeInTheDocument();
  });

  it('shows the version transition rather than describing the change', async () => {
    renderPage();
    // The payload deliberately withholds the change body, so the page renders
    // the fields it has. Anything that read like prose here would be a summary
    // the API never provided.
    expect(await screen.findByText('3.1.0 → 3.2.0')).toBeInTheDocument();
    expect(screen.getByText('minor')).toBeInTheDocument();
  });

  it('links out to the capability, because that is where the change is', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: 'salt-ds' });
    expect(link).toHaveAttribute('href', expect.stringContaining('salt-ds'));
  });
});

describe('mark read', () => {
  it('removes the row from the unread view because the server stops returning it', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('salt-ds');
    const rows = screen.getAllByRole('button', { name: 'Mark read' });
    await user.click(rows[0] as HTMLElement);

    // Nothing local removed it — the item carries no read flag. This passes only
    // if the mutation invalidated the list and the refetch of `status=unread`
    // came back without it.
    await waitFor(() => {
      expect(screen.queryByText('salt-ds')).not.toBeInTheDocument();
    });
    // The other one is untouched, which proves the invalidation refetched rather
    // than clearing the cache wholesale.
    expect(screen.getByText('payments-api')).toBeInTheDocument();
  });

  it('reaches the empty state once everything is read', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('salt-ds');
    for (const button of screen.getAllByRole('button', { name: 'Mark read' })) {
      await user.click(button);
    }

    await waitFor(async () => {
      expect(await screen.findByText(/up to date with every capability/)).toBeInTheDocument();
    });
  });
});

describe('the read filter', () => {
  it('shows a marked item again under `all`', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('salt-ds');
    await user.click(screen.getAllByRole('button', { name: 'Mark read' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByText('salt-ds')).not.toBeInTheDocument());

    // Read state is a filter, not a deletion. If the mark-read invalidation had
    // only covered the active filter, this view would still be stale.
    await user.click(screen.getByRole('button', { name: 'all' }));
    expect(await screen.findByText('salt-ds')).toBeInTheDocument();
  });
});
