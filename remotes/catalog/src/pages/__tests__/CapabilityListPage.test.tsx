import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * The seeded tenant publishes one entity type, all active, all created the same
 * day, so three of the five served fields are constant down the whole page. The
 * assertions below are paired on purpose: the header has to be gone *and* the
 * value has to still be stated, because dropping the column without saying what
 * it held would be hiding a fact rather than compressing one.
 */
describe('the browse table', () => {
  it('drops columns that cannot tell two rows apart, and says what they held', async () => {
    renderAt('/catalog');
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(within(table).queryByRole('columnheader', { name: /^Type$/i })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('columnheader', { name: /^Active$/i }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('columnheader', { name: /^Created$/i }),
    ).not.toBeInTheDocument();

    // The fact survives the column.
    expect(
      screen.getByText(/Every row on this page is Capability, active, created 2026-06-01\./),
    ).toBeInTheDocument();
  });

  it('keeps the name and the external id, which do tell rows apart', async () => {
    renderAt('/catalog');
    const table = await screen.findByRole('table', { name: /Capabilities in this tenant/i });

    expect(within(table).getByRole('columnheader', { name: /Name/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /External ID/i })).toBeInTheDocument();
    // A named absence rather than a dash, so nobody chases a coordinate that was
    // never published.
    expect(within(table).getAllByText('Not published').length).toBeGreaterThan(0);
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
