import type { RegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from '../GlobalSearch';

/**
 * The one journey these all protect: no keystroke into the global search may be
 * answered with literal nothing. Each state the suggestions can be in — resolving,
 * resolved to zero, failed, or not yet asked — has its own line, and the lines are
 * different facts, so each is asserted by its exact words.
 */

const session = makeSession({ role: 'consumer', personaKey: 'consumer' });

function searchClient(respond: () => Promise<unknown>): RegistryClient {
  return {
    request: vi.fn((path: string) => {
      if (path.startsWith('/v1/search')) return respond();
      throw new Error(`unstubbed request: ${path}`);
    }),
  } as unknown as RegistryClient;
}

function renderSearch(client: RegistryClient) {
  renderWithProviders(<GlobalSearch session={session} client={client} />, { session });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('the suggestion status line', () => {
  it('presents matching destinations with type, relevance, and a full-results action', async () => {
    renderSearch(
      searchClient(() =>
        Promise.resolve({
          items: [
            {
              entity_id: 'design-system',
              name: 'Design System',
              entity_type: 'platform_capability',
              score: 0.91,
              citations: [],
            },
          ],
        }),
      ),
    );

    await userEvent.type(screen.getByRole('textbox'), 'design');

    expect(await screen.findByText('Search results')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Design System' })).toHaveAttribute(
      'href',
      '/catalog/design-system',
    );
    expect(screen.getByText(/platform capability/i)).toBeInTheDocument();
    expect(screen.getByText('Relevance 0.91')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all results' })).toHaveAttribute(
      'href',
      '/catalog?q=design',
    );
  });

  it('says zero hits is an answer, and where the full search is', async () => {
    renderSearch(searchClient(() => Promise.resolve({ items: [] })));

    await userEvent.type(screen.getByRole('textbox'), 'graph');

    expect(
      await screen.findByText('No capabilities match — press Enter for the full search'),
    ).toBeInTheDocument();
  });

  it('does not claim "no matches" while the query is still running', async () => {
    // A promise that never settles: the query stays in flight for the whole test.
    renderSearch(searchClient(() => new Promise(() => {})));

    await userEvent.type(screen.getByRole('textbox'), 'graph');

    expect(await screen.findByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText(/No capabilities match/)).not.toBeInTheDocument();
  });

  it('names a failed query as unavailable, not as empty', async () => {
    renderSearch(searchClient(() => Promise.reject(new Error('boom'))));

    await userEvent.type(screen.getByRole('textbox'), 'graph');

    expect(
      await screen.findByText('Suggestions unavailable — press Enter to search'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No capabilities match/)).not.toBeInTheDocument();
  });

  it('stays quiet below two characters instead of showing a loading line forever', async () => {
    // With the query disabled, TanStack reports isPending; only isFetching may
    // drive the loading row, or this state would spin without end.
    renderSearch(searchClient(() => new Promise(() => {})));

    await userEvent.type(screen.getByRole('textbox'), 'g');

    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });
});

describe('the keyboard shortcut', () => {
  it('answers with a starter line when there are no recents to show', async () => {
    renderSearch(searchClient(() => Promise.resolve({ items: [] })));

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByText('Type to search the catalog')).toBeInTheDocument();
  });

  it('still shows recent searches when there are some', async () => {
    window.localStorage.setItem('kui:recent-searches:consumer', JSON.stringify(['ledger']));
    renderSearch(searchClient(() => Promise.resolve({ items: [] })));

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByText('Recent searches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ledger' })).toBeInTheDocument();
    expect(screen.queryByText('Type to search the catalog')).not.toBeInTheDocument();
  });
});

describe('the field itself', () => {
  it('does not share the catalog page filter placeholder word-for-word', () => {
    renderSearch(searchClient(() => Promise.resolve({ items: [] })));

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Search from anywhere…   /');
    expect(input).toHaveAccessibleName('Search from anywhere');
  });
});
