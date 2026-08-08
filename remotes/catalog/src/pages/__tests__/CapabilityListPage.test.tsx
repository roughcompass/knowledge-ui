import { createRegistryClient } from '@knowledge-ui/api-client';
import {
  makeEntityRef,
  makeSearchHit,
  makeSession,
  renderWithProviders,
} from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { CapabilityListPage } from '../CapabilityListPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderAt = (path: string, role: 'consumer' | 'producer' = 'consumer') =>
  renderWithProviders(<CapabilityListPage />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
    route: path,
  });

/**
 * A column that says the same thing on every row is not a column.
 *
 * The seeded tenant publishes one entity type, all created the same day, so two
 * of the served fields are constant down the whole page. The assertions below
 * are paired on purpose: the header has to be gone *and* the value has to still
 * be stated, because dropping the column without saying what it held would be
 * hiding a fact rather than compressing one.
 */
describe('the browse table', () => {
  it('drops columns that cannot tell two rows apart, and says what they held', async () => {
    renderAt('/catalog');
    /*
      Wait for the rows, not just for a table.

      The loading branch now renders a placeholder table carrying the full column
      set — which is correct, since the columns it is given are the ones it would
      render — so `findByRole('table')` matches before the data lands. This
      assertion is about what survives *after* the rows arrive, and settling on a
      real cell is what says they have.
    */
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(within(table).queryByRole('columnheader', { name: /^Type$/i })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('columnheader', { name: /^Created$/i }),
    ).not.toBeInTheDocument();

    // The fact survives the column.
    expect(
      screen.getByText(/Every row on this page is Capability, created 2026-06-01\./),
    ).toBeInTheDocument();
  });

  it('keeps the name and the external id, which do tell rows apart', async () => {
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(within(table).getByRole('columnheader', { name: /Name/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /External ID/i })).toBeInTheDocument();
    // A named absence rather than a dash, so nobody chases a coordinate that was
    // never published.
    expect(within(table).getAllByText('Not published').length).toBeGreaterThan(0);
  });

  it('collapses a page where nothing is published into one sentence', async () => {
    server.use(
      http.get('*/v1/capabilities', () =>
        HttpResponse.json({
          items: [makeEntityRef(), makeEntityRef(), makeEntityRef()],
          next_cursor: null,
        }),
      ),
    );
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    // Ten identical cells become one page-scoped sentence — page-scoped because
    // keyset paging serves no totals, so a broader claim would be invented.
    expect(
      within(table).queryByRole('columnheader', { name: /External ID/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Not published')).not.toBeInTheDocument();
    expect(screen.getByText(/not published to a contextplane/)).toBeInTheDocument();
  });
});

/**
 * `is_active` is tri-state on the list read: a served true, a served false, or
 * not served at all — and the last one means the surface already filtered
 * inactive rows out, not that anything is inactive.
 */
describe('the active flag', () => {
  it('claims nothing when the server does not serve the field', async () => {
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(
      within(table).queryByRole('columnheader', { name: /^Active$/i }),
    ).not.toBeInTheDocument();
    // Neither a column, a cell, nor a collapsed sentence may say "inactive" for
    // rows the server never described.
    expect(screen.queryByText(/inactive/)).not.toBeInTheDocument();
  });

  it('names the field when every served row really is inactive', async () => {
    server.use(
      http.get('*/v1/capabilities', () =>
        HttpResponse.json({
          items: [makeEntityRef({ is_active: false }), makeEntityRef({ is_active: false })],
          next_cursor: null,
        }),
      ),
    );
    renderAt('/catalog');

    expect(
      await screen.findByText('Every entry on this page is marked inactive in the contextplane.'),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });
    expect(
      within(table).queryByRole('columnheader', { name: /^Active$/i }),
    ).not.toBeInTheDocument();
  });

  it('collapses a served all-true page into the shared sentence', async () => {
    server.use(
      http.get('*/v1/capabilities', () =>
        HttpResponse.json({
          items: [makeEntityRef({ is_active: true }), makeEntityRef({ is_active: true })],
          next_cursor: null,
        }),
      ),
    );
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

    expect(
      screen.getByText(
        /Every row on this page is Capability, active, not published to a contextplane, created 2026-06-01\./,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the column when served values differ between rows', async () => {
    server.use(
      http.get('*/v1/capabilities', () =>
        HttpResponse.json({
          items: [makeEntityRef({ is_active: true }), makeEntityRef({ is_active: false })],
          next_cursor: null,
        }),
      ),
    );
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(within(table).getByRole('columnheader', { name: /^Active$/i })).toBeInTheDocument();
    expect(within(table).getByText('active')).toBeInTheDocument();
    expect(within(table).getByText('inactive')).toBeInTheDocument();
  });
});

describe('time travel through as_of', () => {
  it('passes the parameter to the list read and says the view is historical', async () => {
    let asOfSeen: string | null = null;
    server.use(
      http.get('*/v1/capabilities', ({ request }) => {
        asOfSeen = new URL(request.url).searchParams.get('as_of');
        return HttpResponse.json({
          items: [makeEntityRef(), makeEntityRef()],
          next_cursor: null,
        });
      }),
    );
    renderAt('/catalog?as_of=2026-01-01T00:00:00Z');

    expect(
      await screen.findByText(/Showing this catalog as it stood at 2026-01-01T00:00:00Z/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Remove the as_of parameter to return to the current view/),
    ).toBeInTheDocument();
    await waitFor(() => expect(asOfSeen).toBe('2026-01-01T00:00:00.000Z'));
  });

  it('does not claim a current view is historical', async () => {
    renderAt('/catalog');
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.queryByText(/as it stood at/)).not.toBeInTheDocument();
  });
});

describe('the search results', () => {
  it('hides the fused score until a reader asks for it', async () => {
    /*
     * The load-bearing assertion on this page. `0.940` in a right-aligned numeric
     * column reads as a percentage or a confidence, and it is neither — it is a
     * fusion score on an arbitrary scale that is not comparable across queries.
     * The row order already carries what a reader can act on.
     */
    renderAt('/catalog?q=notification');
    await screen.findByText('notification-service');

    expect(screen.queryByRole('columnheader', { name: /Score/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Show relevance scores/i }));

    expect(await screen.findByRole('columnheader', { name: /Score/i })).toBeInTheDocument();
  });

  it('tells a reader what search covered when nothing matched', async () => {
    renderAt('/catalog?q=zzzzznothingmatchesthis');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText(/Search covers names and the text recorded/)).toBeInTheDocument();
  });

  it('rounds the served timing to whole milliseconds', async () => {
    // The server reports float milliseconds; sixteen digits of them read as
    // debug output. Rounding is presentation of the served value, not a number
    // this page invented.
    server.use(
      http.get('*/v1/search', () =>
        HttpResponse.json({
          items: [makeSearchHit({ entity_id: 'payments-api', name: 'payments-api' })],
          total: 1,
          took_ms: 7.641875010449439,
        }),
      ),
    );
    renderAt('/catalog?q=payments');

    expect(
      await screen.findByText(/Ranked results for “payments” — 1 in 8 ms/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/7\.641875010449439/)).not.toBeInTheDocument();
  });
});

describe('the framing that varies by what the reader does', () => {
  /*
   * The page is identical for both — same columns, same order, same controls.
   * Only the sentence saying what to do next changes, and it is keyed on the
   * owner-usage capability rather than on a role name, because naming a role in
   * a component is the thing the capability map exists to prevent.
   */
  it('points a publisher at who depends on their work', async () => {
    renderAt('/catalog', 'producer');
    expect(
      await screen.findByText(/including what you publish. Open one to see who depends on it/),
    ).toBeInTheDocument();
  });

  it('points a consumer at how to adopt something', async () => {
    renderAt('/catalog', 'consumer');
    expect(
      await screen.findByText(/what it is for, who else depends on it, and how to adopt/),
    ).toBeInTheDocument();
  });

  it('does not change the table between the two', async () => {
    const publisher = renderAt('/catalog', 'producer');
    const publisherHeaders = (await publisher.findAllByRole('columnheader')).map(
      (header) => header.textContent,
    );
    publisher.unmount();

    const consumer = renderAt('/catalog', 'consumer');
    const consumerHeaders = (await consumer.findAllByRole('columnheader')).map(
      (header) => header.textContent,
    );

    expect(publisherHeaders).toEqual(consumerHeaders);
  });
});
