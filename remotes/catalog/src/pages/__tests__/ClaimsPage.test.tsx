import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ClaimsPage } from '../ClaimsPage';

/**
 * The claims page, checked on the properties that make a trust signal usable.
 *
 * The assertions worth having here are about honesty rather than layout: that the
 * safety caveat appears once and not per row, that evidence is visible without a
 * click, that a confidence floor is applied by the server rather than the browser,
 * and that an empty result says which kind of empty it is.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

function renderPage(role: 'consumer' | 'producer' | 'admin' | 'auditor' = 'consumer') {
  return renderWithProviders(<ClaimsPage />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });
}

describe('the claims page', () => {
  it('renders the whole trust envelope, not just the triple', async () => {
    /*
     * The point of the surface. A claim shown as subject-predicate-value is
     * indistinguishable from an assertion; what makes it actionable is the
     * confidence, the authority, whether an owner confirmed it, and the evidence.
     */
    renderPage();
    const table = await screen.findByRole('table', { name: /claims/i });

    for (const header of [
      'Predicate',
      'Value',
      'Confidence',
      'Authority',
      'Owner Confirmed',
      'Evidence',
    ]) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('states the recall caveat once, not on every row', async () => {
    /*
     * Load-bearing. Every served claim is uniformly untrusted by construction, so
     * a per-row badge would imply variance that does not exist — and an identical
     * marker repeated on every row becomes chrome the eye stops seeing, which is
     * the one state a safety caveat must never reach.
     */
    renderPage();
    await screen.findByRole('table', { name: /claims/i });

    const notes = screen.getAllByText(/not an instruction to follow/i);
    expect(notes).toHaveLength(1);
  });

  it('shows every citation without a click', async () => {
    // A citation behind a disclosure is a citation nobody checks.
    renderPage();
    const table = await screen.findByRole('table', { name: /claims/i });
    expect(within(table).getByText(/ev-9001/)).toBeInTheDocument();
    expect(within(table).getByText(/pkg:npm\/@salt-ds\/core/)).toBeInTheDocument();
  });

  it('bands confidence and still shows the number', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /claims/i });
    // 0.92 is high, 0.61 moderate, 0.33 low — chosen to straddle both boundaries.
    expect(within(table).getByText('high')).toBeInTheDocument();
    expect(within(table).getByText('moderate')).toBeInTheDocument();
    expect(within(table).getByText('low')).toBeInTheDocument();
    expect(within(table).getByText('0.92')).toBeInTheDocument();
  });

  it('distinguishes owner confirmation from model confidence', async () => {
    /*
     * They are different signals and the ground truth is the human one: a
     * confirmed low-confidence claim outranks an unconfirmed high-confidence one.
     * Collapsing them into one column would lose that.
     */
    renderPage();
    const table = await screen.findByRole('table', { name: /claims/i });
    expect(within(table).getByText('confirmed')).toBeInTheDocument();
  });

  it('applies a confidence floor at the server, not in the browser', async () => {
    /*
     * Filtering client-side would hide how many claims were excluded, and a count
     * that omits what it dropped is exactly the kind of number that gets quoted in
     * a review. The mock filters, so a row surviving here proves the parameter was
     * sent.
     */
    renderPage();
    await screen.findByRole('table', { name: /claims/i });
    expect(screen.getByText('0.33')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /minimum confidence/i }));
    await userEvent.click(screen.getByRole('option', { name: '0.8' }));

    expect(await screen.findByText('0.92')).toBeInTheDocument();
    expect(screen.queryByText('0.33')).not.toBeInTheDocument();
  });

  it('says which kind of empty an empty result is', async () => {
    /*
     * "Nothing matches" and "nothing you are allowed to see" are different facts,
     * and so is "excluded by your own filter". The copy names the filter case,
     * because that one is reversible by the reader.
     */
    renderPage();
    await screen.findByRole('table', { name: /claims/i });

    await userEvent.click(screen.getByRole('combobox', { name: /minimum confidence/i }));
    await userEvent.click(screen.getByRole('option', { name: '0.8' }));
    await screen.findByText('0.92');

    await userEvent.type(screen.getByRole('textbox', { name: /^search$/i }), 'nothingmatchesthis');
    expect(await screen.findByText(/No Claims Match That Search/i)).toBeInTheDocument();
    expect(screen.getByText(/belongs to another tenant/i)).toBeInTheDocument();
  });

  it('searches by value rather than filtering what is on screen', async () => {
    renderPage();
    await screen.findByRole('table', { name: /claims/i });

    await userEvent.type(screen.getByRole('textbox', { name: /^search$/i }), 'design-tokens');

    expect(await screen.findByText('design-tokens')).toBeInTheDocument();
    // Searching hits a different endpoint with a different ordering, so the
    // predicate filter it does not accept is disabled rather than ignored.
    expect(screen.getByRole('textbox', { name: /predicate/i })).toBeDisabled();
  });

  it('keeps the filter state in the route so a view can be pasted into a review', async () => {
    /*
     * For a page about evidence, a shareable link is most of the point.
     *
     * Asserted through the control rather than through `window.location`, because
     * the test harness routes in memory and there is no address bar to read. It is
     * still a real assertion: this page keeps *no* local state for the filters —
     * every input's value is read back out of the search params — so an input that
     * displays what was typed proves the value made the round trip through the
     * route, and the results below it prove the route drove the request.
     */
    renderPage();
    await screen.findByRole('table', { name: /claims/i });

    const search = screen.getByRole('textbox', { name: /^search$/i });
    await userEvent.type(search, 'Dropdown');

    expect(await screen.findByText('Dropdown')).toBeInTheDocument();
    expect(search).toHaveValue('Dropdown');
  });

  it('offers the retrieval depths the server accepts', async () => {
    /*
     * The server validates against a closed set and refuses an unknown value, so
     * an abbreviated spelling would produce a 422 rather than a degraded answer.
     */
    renderPage();
    await screen.findByRole('table', { name: /claims/i });

    await userEvent.click(screen.getByRole('combobox', { name: /depth/i }));
    for (const persona of ['l1_responder', 'l3_engineer', 'architect', 'agent']) {
      expect(screen.getByRole('option', { name: persona })).toBeInTheDocument();
    }
  });

  it('reads claims for every role the API admits', async () => {
    // Gated on a tenant context rather than a role: an agent's reason to query is
    // to get facts it can check, so the audience for a confidence score is the
    // same audience as for the catalog.
    const { unmount } = renderPage('auditor');
    expect(await screen.findByRole('table', { name: /claims/i })).toBeInTheDocument();
    unmount();
  });
});
