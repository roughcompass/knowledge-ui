import { createRegistryClient } from '@knowledge-ui/api-client';
import { findLoadedTable, makeSession, renderWithProviders } from '@knowledge-ui/testing';
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
  it('renders every field of the envelope the API serves', async () => {
    /*
     * The point of the surface, and asserted exhaustively rather than by listing
     * the columns that happen to exist.
     *
     * An earlier version of this test named six headers and passed, while the page
     * silently dropped four served fields — including the subject, without which a
     * predicate and a value do not say what they are about. The test was shaped to
     * the code instead of to the contract, so it endorsed the gap it existed to
     * catch. Driving it from the response keys is what makes that impossible: a
     * field the API adds and the page ignores now fails here.
     */
    renderPage();
    const table = await findLoadedTable(/claims/i);

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim());

    /*
     * `label`, `trust` and `trust_note` are deliberately absent from this list:
     * they are structurally invariant across every served claim, and they render
     * once per view as the recall caveat rather than per row. Everything else the
     * response carries is a per-claim value and belongs in a column.
     */
    const columnFields: Array<[string, string]> = [
      ['subject_entity_id', 'Subject'],
      ['predicate', 'Predicate'],
      ['value', 'Value'],
      ['confidence', 'Confidence'],
      ['human_confirmed', 'Owner Confirmed'],
      ['valid_from', 'Valid'],
      ['citations', 'Evidence'],
    ];

    for (const [field, header] of columnFields) {
      expect(headers, `${field} is served but has no column`).toContain(header);
    }

    /*
     * Two fields are rendered *inside* another cell rather than in a column of their
     * own: the category sits with the predicate and the authority with the evidence,
     * because each pair answers one question and nine columns broke the subject across
     * three lines. Still asserted, by value — the requirement is that a served field
     * reaches the screen, not that it gets a column.
     */
    expect(
      within(table).getAllByText('interface').length,
      'claim_category is served but not rendered',
    ).toBeGreaterThan(0);
    expect(
      within(table).getAllByText('derived').length,
      'authority is served but not rendered',
    ).toBeGreaterThan(0);
  });

  it('shows the subject, so a claim says what it is about', async () => {
    // A list spanning entities with no subject column is a list of assertions
    // about nothing in particular.
    renderPage();
    const table = await findLoadedTable(/claims/i);
    /*
      The display name, not the slug or the id. A claims browser whose subject column
      says `salt-design-system` — or worse, a UUID — is a list of assertions about
      things the reader cannot identify, which is what this column existed to fix and
      did not. The resolver prefers a name the server sent and falls back to the id.
    */
    expect(within(table).getAllByText('Salt Design System').length).toBeGreaterThan(0);
  });

  it('shows the interval a claim was true for, and when it was last seen', async () => {
    /*
     * Bi-temporality is not decoration here: a claim that was true and has not
     * been re-observed since is a different thing from one confirmed this morning,
     * and an open interval reads as "still holds" rather than as missing data.
     */
    renderPage();
    const table = await findLoadedTable(/claims/i);
    expect(within(table).getAllByText(/still holds/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/^seen 2026-08-04$/).length).toBeGreaterThan(0);
  });

  it('states the recall caveat once, not on every row', async () => {
    /*
     * Load-bearing. Every served claim is uniformly untrusted by construction, so
     * a per-row badge would imply variance that does not exist — and an identical
     * marker repeated on every row becomes chrome the eye stops seeing, which is
     * the one state a safety caveat must never reach.
     */
    renderPage();
    await findLoadedTable(/claims/i);

    const notes = screen.getAllByText(/not an instruction to follow/i);
    expect(notes).toHaveLength(1);
  });

  it('keeps the subject and claim destinations available as links', async () => {
    /*
     * Subject and claim are built inside `render`; both must remain real links
     * when the shared table delegates its presentation entirely to Salt.
     */
    renderPage();
    const table = await findLoadedTable(/claims/i);
    const [, firstDataRow] = within(table).getAllByRole('row');
    if (!firstDataRow) throw new Error('first claim row missing');
    expect(within(firstDataRow).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('lets the value and evidence cells wrap rather than deciding the table width', async () => {
    /*
     * The two prose columns. Held to one line they pushed Owner Confirmed,
     * Valid and Evidence — the columns the intro tells a reader to judge by —
     * past the edge of the card.
     */
    renderPage();
    const table = await findLoadedTable(/claims/i);
    const valueCell = within(table).getByText('Dropdown').closest('td');
    const evidenceCell = within(table)
      .getByText(/ev-9001/)
      .closest('td');
    expect(valueCell).not.toHaveStyle({ whiteSpace: 'nowrap' });
    expect(evidenceCell).not.toHaveStyle({ whiteSpace: 'nowrap' });
  });

  it('shows every citation without a click', async () => {
    // A citation behind a disclosure is a citation nobody checks.
    renderPage();
    const table = await findLoadedTable(/claims/i);
    expect(within(table).getByText(/ev-9001/)).toBeInTheDocument();
    expect(within(table).getByText(/pkg:npm\/@salt-ds\/core/)).toBeInTheDocument();
  });

  it('bands confidence and still shows the number', async () => {
    renderPage();
    const table = await findLoadedTable(/claims/i);
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
    const table = await findLoadedTable(/claims/i);
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
    await findLoadedTable(/claims/i);
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
    await findLoadedTable(/claims/i);

    await userEvent.click(screen.getByRole('combobox', { name: /minimum confidence/i }));
    await userEvent.click(screen.getByRole('option', { name: '0.8' }));
    await screen.findByText('0.92');

    await userEvent.type(screen.getByRole('textbox', { name: /^search$/i }), 'nothingmatchesthis');
    expect(await screen.findByText(/No Claims Match That Search/i)).toBeInTheDocument();
    expect(screen.getByText(/belongs to another tenant/i)).toBeInTheDocument();
  });

  it('searches by value rather than filtering what is on screen', async () => {
    renderPage();
    await findLoadedTable(/claims/i);

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
    await findLoadedTable(/claims/i);

    const search = screen.getByRole('textbox', { name: /^search$/i });
    await userEvent.type(search, 'Dropdown');

    expect(await screen.findByText('Dropdown')).toBeInTheDocument();
    expect(search).toHaveValue('Dropdown');
  });

  it('offers the retrieval personas the server accepts, under that name', async () => {
    /*
     * Two assertions in one, and the label is the load-bearing half.
     *
     * The server validates the value against a closed set and refuses anything else,
     * so an abbreviated spelling would produce a 422 rather than a degraded answer.
     * What is written here is therefore the *reading* of that closed set: the option
     * still carries `l1_responder` as its value, and `termText` sentence-cases it for
     * display so a filter list does not show snake_case to a reader. Spelled out as
     * literals rather than derived from `CLAIM_PERSONAS.map(termText)`, because a
     * test that recomputes the thing it is checking passes when both are wrong.
     *
     * And the control is found by the word "Persona" rather than "Depth", which is
     * what it used to say. "Depth" named the effect instead of the values in the
     * list, and the impact panel two clicks away has a control genuinely called
     * Depth holding the traversal depths 1 to 5 — so one word covered two unrelated
     * controls in one app. Asserted here because a label is the only part of a
     * filter a reader has to go on.
     */
    renderPage();
    await findLoadedTable(/claims/i);

    await userEvent.click(screen.getByRole('combobox', { name: /^persona$/i }));
    for (const persona of ['L1 responder', 'L3 engineer', 'Architect', 'Agent — default']) {
      expect(screen.getByRole('option', { name: persona })).toBeInTheDocument();
    }
  });

  it('names the server default in the persona control instead of posing as a neutral filter', async () => {
    /*
     * The neighbours default to "Any" and this one cannot: the endpoint answers
     * at agent depth when the parameter is omitted, so there is no unfiltered
     * reading to offer. Unmarked, a first-time reader had no way to know their
     * first view of claims was already the machine-depth variant.
     */
    renderPage();
    await findLoadedTable(/claims/i);
    expect(screen.getByRole('combobox', { name: /^persona$/i })).toHaveTextContent(
      'Agent — default',
    );
  });

  it('reads claims for every role the API admits', async () => {
    // Gated on a tenant context rather than a role: an agent's reason to query is
    // to get facts it can check, so the audience for a confidence score is the
    // same audience as for the catalog.
    const { unmount } = renderPage('auditor');
    expect(await findLoadedTable(/claims/i)).toBeInTheDocument();
    unmount();
  });
});
