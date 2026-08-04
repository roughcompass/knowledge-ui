import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UsagePage } from '../UsagePage';

/**
 * The usage console, checked on the four things the service took care to get right
 * and a dashboard destroys by default.
 *
 * None of these assertions is about layout. Each one is a number that would be
 * wrong in a way the reader could not detect, which is the only kind of wrong that
 * matters on a page whose whole purpose is to be quotable.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

function renderPage(role: 'consumer' | 'producer' | 'admin' | 'auditor' = 'admin') {
  return renderWithProviders(<UsagePage />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });
}

describe('reach, which has three distinct outcomes', () => {
  it('renders the reason when a distinct count is unavailable, never a zero', async () => {
    /*
     * The window can reach past raw retention, and then the count cannot be
     * recovered from daily totals. The API ships the reason expressly "so a caller
     * can render the reason rather than a zero" — and a zero here would report an
     * unused platform on a page read to decide whether the platform is used.
     */
    renderPage();
    const table = await screen.findByRole('table', { name: /usage by surface/i });
    expect(within(table).getByText('Not available')).toBeInTheDocument();
    expect(within(table).getByText(/retention boundary/i)).toBeInTheDocument();
  });

  it('renders a real zero as a zero', async () => {
    /*
     * The companion case, and the reason the check is against null rather than
     * falsiness: one surface genuinely had no callers. A component testing
     * truthiness passes the test above and fails this one.
     */
    renderPage();
    const table = await screen.findByRole('table', { name: /usage by surface/i });
    const webhookRow = within(table).getByText('webhook').closest('tr') as HTMLElement;
    expect(webhookRow).not.toBeNull();

    // The reach cell shows a count and its actor-days beneath. Asserted through the
    // actor-days label because the row is legitimately full of zeros — what matters
    // is that this cell renders the count rather than the unavailable branch.
    expect(within(webhookRow).getByText('0 actor-days')).toBeInTheDocument();
    expect(within(webhookRow).queryByText('Not available')).not.toBeInTheDocument();
  });

  it('never calls actor-days a headcount', async () => {
    // An actor active on ten days counts ten times, so for a month it runs up to
    // thirty times too large. Labelling it "actors" is the misreading the API warns
    // about in the field's own description.
    renderPage();
    const table = await screen.findByRole('table', { name: /usage by surface/i });
    expect(within(table).getByText(/96 actor-days/)).toBeInTheDocument();
  });
});

describe('a day with no traffic', () => {
  it('names the gap rather than drawing through it', async () => {
    /*
     * The load-bearing assertion of the page. The series omits a day with no
     * traffic instead of sending zero, "so a caller can tell an outage from a quiet
     * weekend" — and every charting default fills that gap. The mocked window spans
     * seven days and returns six, with the gap in the middle.
     */
    renderPage();
    expect(await screen.findByText(/No traffic was recorded on 2026-07-31/)).toBeInTheDocument();
    expect(screen.getByText(/omits a day rather than reporting zero/)).toBeInTheDocument();
  });

  it('plots only the days it was given', async () => {
    // Six points for a seven-day window: the table is the chart's data, so a row
    // per recorded day and none for the gap.
    renderPage();
    const figure = await screen.findByRole('table', { name: /REST calls per day/i });
    expect(within(figure).getAllByRole('row')).toHaveLength(7); // 6 days + header
    expect(within(figure).queryByText('2026-07-31')).not.toBeInTheDocument();
  });
});

describe('percentiles', () => {
  it('labels the worst daily p95 as such, and says why it is not the window p95', async () => {
    // "An average of percentiles has no definition" — so calling this p95 would
    // assert a statistic that does not exist.
    renderPage();
    // Both the surface table and the tool table carry the column, and both should:
    // the label belongs wherever the figure appears.
    const headers = await screen.findAllByRole('columnheader', { name: /Worst daily p95/i });
    expect(headers.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/percentiles cannot be averaged/i).length).toBeGreaterThan(0);
  });

  it('says a surface had no timed calls rather than showing zero latency', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: /usage by surface/i });
    expect(within(table).getAllByText('No timed calls').length).toBeGreaterThan(0);
  });
});

describe('the chart carries its table', () => {
  it('renders the bars through the composite that cannot omit the table', async () => {
    /*
     * The marks are unimportable outside the component kit, and the figure takes
     * its mark as a prop — so a screen can only get a chart through a composite that
     * pairs it with the rows. This asserts the table exists, which is the half a
     * reader can actually check.
     */
    renderPage();
    const figure = await screen.findByRole('table', { name: /REST calls per day/i });
    expect(within(figure).getByRole('columnheader', { name: 'Calls' })).toBeInTheDocument();
    expect(
      within(figure).getByRole('columnheader', { name: /Actors That Day/i }),
    ).toBeInTheDocument();
  });
});

describe('the two usage scopes are separate gates', () => {
  it('gives an admin both the deployment panels and the owned-capability panel', async () => {
    renderPage('admin');
    expect(await screen.findByRole('table', { name: /usage by surface/i })).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: /usage of owned capabilities/i }),
    ).toBeInTheDocument();
  });

  it('gives a producer only their own capabilities, and says why', async () => {
    /*
     * The reason these are two capabilities rather than one: a producer is entitled
     * to usage of what their tenant owns and not to the deployment's. One entry
     * would either refuse them their own numbers or offer them an operator screen
     * the API rejects.
     */
    renderPage('producer');
    expect(
      await screen.findByRole('table', { name: /usage of owned capabilities/i }),
    ).toBeInTheDocument();
    // Rendered as a note rather than a card, since it qualifies the panels around it
    // rather than being a section of its own.
    expect(screen.getByText('Operator Scope')).toBeInTheDocument();
    expect(screen.getByText(/gated on\s+the operator scope/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /usage by surface/i })).not.toBeInTheDocument();
  });

  it('tells a consumer once rather than refusing four panels', async () => {
    renderPage('consumer');
    expect(await screen.findByText(/Usage is not available to this role/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /usage by surface/i })).not.toBeInTheDocument();
  });
});

describe('what the page refuses to say', () => {
  it('states that nothing here is a rate and nothing is badged as a proxy', async () => {
    /*
     * The API classifies none of its fields, so a strength badge would be a claim
     * the response does not make. Saying that plainly is the alternative to either
     * inventing one or leaving the reader to assume every number is equally solid.
     */
    renderPage();
    expect(await screen.findByText(/none is\s+a rate/i)).toBeInTheDocument();
    expect(screen.getByText(/classifies none of these fields/i)).toBeInTheDocument();
  });

  it('reports the window the service returned, not the one requested', async () => {
    // The response echoes its own start and end, which is the mechanism for
    // noticing a rollup that did not reach back far enough.
    renderPage();
    /*
     * Every panel states its own window rather than the page stating one for all of
     * them, because each is a separate response that could cover a different range.
     * So more than one match is the correct outcome, not an ambiguity to narrow.
     */
    const stated = await screen.findAllByText(/2026-07-28 to 2026-08-03/);
    expect(stated.length).toBeGreaterThanOrEqual(2);
  });
});
