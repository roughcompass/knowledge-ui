import { createRegistryClient } from '@knowledge-ui/api-client';
import {
  findLoadedTable,
  makeSession,
  renderWithProviders,
  scenarios,
} from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsagePage } from '../UsagePage';

/**
 * The usage console, checked on the four things the service took care to get right
 * and a dashboard destroys by default.
 *
 * None of these assertions is about layout. Each one is a number that would be
 * wrong in a way the reader could not detect, which is the only kind of wrong that
 * matters on a page whose whole purpose is to be quotable.
 */

/*
 * The clock is pinned, because the mocked endpoints now echo the window they were
 * asked for — as the real ones do — which makes every window relative to today.
 * Without a fixed today these assertions would name dates that are correct only on
 * the day they were written.
 *
 * Only `Date` is faked. Faking timers wholesale stops `react-query` and `user-event`
 * from settling, and nothing here needs to control time passing — only what day it is.
 */
const TODAY = '2026-08-08T12:00:00Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => {
  vi.useRealTimers();
});

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
    const table = await findLoadedTable(/usage by surface/i);
    expect(within(table).getByText('Not available')).toBeInTheDocument();
    expect(within(table).getByText(/retention boundary/i)).toBeInTheDocument();
  });

  it('renders a real zero as a zero', async () => {
    /*
     * The companion case, and the reason the check is against null rather than
     * falsiness: a surface genuinely had no callers. A component testing truthiness
     * passes the test above and fails this one.
     *
     * A scenario override rather than a third surface in the default fixture. The
     * endpoint declares exactly two surfaces and both are spoken for there, and an
     * earlier version of this test invented a `webhook` surface to make room — a
     * value the API can never emit, and precisely the "never richer than the endpoint
     * it stands for" trap.
     */
    server.use(...scenarios.usageSurfaceWithNoCallers());

    renderPage();
    const table = await findLoadedTable(/usage by surface/i);
    const quietRow = within(table).getByText('mcp').closest('tr') as HTMLElement;
    expect(quietRow).not.toBeNull();

    // The reach cell shows a count and its actor-days beneath. Asserted through the
    // actor-days label because the row is legitimately full of zeros — what matters
    // is that this cell renders the count rather than the unavailable branch.
    expect(within(quietRow).getByText('0 actor-days')).toBeInTheDocument();
    expect(within(quietRow).queryByText('Not available')).not.toBeInTheDocument();
  });

  it('never calls actor-days a headcount', async () => {
    // An actor active on ten days counts ten times, so for a month it runs up to
    // thirty times too large. Labelling it "actors" is the misreading the API warns
    // about in the field's own description.
    renderPage();
    const table = await findLoadedTable(/usage by surface/i);
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
    expect(await screen.findByText(/No traffic was recorded on 2026-08-05/)).toBeInTheDocument();
    expect(screen.getByText(/omits a day rather than reporting zero/)).toBeInTheDocument();
  });

  it('plots only the days it was given', async () => {
    // Six points for a seven-day window: the table is the chart's data, so a row
    // per recorded day and none for the gap.
    renderPage();
    const figure = await findLoadedTable(/REST calls per day/i);
    expect(within(figure).getAllByRole('row')).toHaveLength(7); // 6 days + header
    expect(within(figure).queryByText('2026-08-05')).not.toBeInTheDocument();
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
    // A surface with no timed calls has no percentile at all, which is a different
    // statement from a latency of zero.
    server.use(...scenarios.usageSurfaceWithNoCallers());

    renderPage();
    const table = await findLoadedTable(/usage by surface/i);
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
    const figure = await findLoadedTable(/REST calls per day/i);
    expect(within(figure).getByRole('columnheader', { name: 'Calls' })).toBeInTheDocument();
    expect(
      within(figure).getByRole('columnheader', { name: /Actors That Day/i }),
    ).toBeInTheDocument();
  });
});

describe('demand, as distinct from the catalogue', () => {
  it('renders which capabilities callers actually asked about', async () => {
    /*
     * The fifth read. It was wired end to end — hook, key, export, cache-key test —
     * and rendered nowhere, while the commit adding it claimed five endpoints were
     * served. Caught by a defect hunt comparing the claim against the page.
     */
    renderPage();
    const table = await findLoadedTable(/usage by capability/i);
    /*
      The name, not the id. This ranking answers with `capability_id` and no name —
      its own column comment says so — so the table read as a list of identifiers
      nobody could match to a capability. The resolver fills that in and the cell
      links across into the catalog.
    */
    expect(within(table).getByText('Salt Design System')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Actor-Days' })).toBeInTheDocument();
  });
});

describe('the two usage scopes are separate gates', () => {
  it('gives an admin both the deployment panels and the owned-capability panel', async () => {
    renderPage('admin');
    expect(await findLoadedTable(/usage by surface/i)).toBeInTheDocument();
    expect(await findLoadedTable(/usage of owned capabilities/i)).toBeInTheDocument();
  });

  it('gives a producer only their own capabilities, and says why', async () => {
    /*
     * The reason these are two capabilities rather than one: a producer is entitled
     * to usage of what their tenant owns and not to the deployment's. One entry
     * would either refuse them their own numbers or offer them an operator screen
     * the API rejects.
     */
    renderPage('producer');
    expect(await findLoadedTable(/usage of owned capabilities/i)).toBeInTheDocument();
    // The refusal leads with what a producer *can* see, then names the role that
    // could see more — the same boxed idiom every gated section uses.
    expect(screen.getByText('Usage across the deployment')).toBeInTheDocument();
    expect(
      screen.getByText(/Only the admin role can read usage across the whole deployment/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /usage by surface/i })).not.toBeInTheDocument();
  });

  it('tells a consumer once rather than refusing four panels', async () => {
    renderPage('consumer');
    expect(await screen.findByText(/Usage is not available to this role/i)).toBeInTheDocument();
    expect(screen.getByText(/Only the admin role or the producer role/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /usage by surface/i })).not.toBeInTheDocument();
    // No window control above a refusal: the dropdown would govern queries this
    // session cannot make.
    expect(screen.queryByText('Window')).not.toBeInTheDocument();
  });

  it('offers a refused consumer the persona that would succeed', async () => {
    const onSwitchPersona = vi.fn();
    renderWithProviders(<UsagePage />, {
      session: makeSession({ role: 'consumer', personaKey: 'consumer' }),
      client: createRegistryClient({
        baseUrl: 'http://localhost',
        getToken: () => tokenFor('knowledge-ui-consumer'),
      }),
      personas: [
        {
          key: 'producer',
          label: 'Tenant — Producer',
          description: '',
          clientId: 'knowledge-ui-producer',
          clientSecret: '',
          entitlements: [],
          expectedRole: 'producer',
        },
      ],
      onSwitchPersona,
    });

    const button = await screen.findByRole('button', { name: /Switch to Tenant — Producer/ });
    button.click();
    expect(onSwitchPersona).toHaveBeenCalledWith('producer');
  });
});

describe('what the page refuses to say', () => {
  it('states that nothing here is a rate and nothing is badged as a proxy', async () => {
    /*
     * The API classifies none of its fields, so a strength badge would be a claim
     * the response does not make. Saying that plainly is the alternative to either
     * inventing one or leaving the reader to assume every number is equally solid.
     * One or two user-voice sentences: the reasoning lives beside the note in the
     * source, not on the screen.
     */
    renderPage();
    expect(
      await screen.findByText(/The service reports no rates, so\s+none are shown/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not say how directly each figure was measured/i),
    ).toBeInTheDocument();
  });

  it('renders a measured payload in a unit that keeps it visible', async () => {
    /*
     * A fixed megabyte divisor rendered every real kilobyte-scale payload as
     * "0.0 MB" — a measured value shown as zero, which the honesty rules call a
     * defect. The unit adapts instead, and null still says nothing measured it.
     */
    renderPage('producer');
    const table = await findLoadedTable(/usage of owned capabilities/i);
    expect(within(table).getByText('61 MB')).toBeInTheDocument();
    expect(within(table).getByText('Not measured')).toBeInTheDocument();
    expect(within(table).queryByText(/0\.0 MB/)).not.toBeInTheDocument();
  });

  it('reports the window the service returned, not the one requested', async () => {
    /*
     * The response echoes its own start and end, which is the mechanism for noticing a
     * rollup that did not reach back far enough. Every panel states its own window
     * rather than the page stating one for all of them, because each is a separate
     * response that could cover a different range — so more than one match is the
     * correct outcome, not an ambiguity to narrow.
     *
     * Asserted on the rendered value rather than the ISO pair: the window moved out of
     * each description and into the section header as a control, which is where a
     * reader now reads it and where they click to change it.
     */
    renderPage();
    const stated = await screen.findAllByRole('button', { name: /Window: 2 Aug – 8 Aug 2026/ });
    expect(stated.length).toBeGreaterThanOrEqual(2);
  });

  it('makes the window a control rather than a caption', async () => {
    /*
     * The point of moving it. Every number on the page is meaningless without the
     * window, so it reads as a value — and a value a reader can act on, rather than a
     * sentence that sends them back to the top of the page to find a dropdown.
     *
     * Only the trigger is asserted here. Opening the panel is floating-ui positioning
     * against a measured viewport, and jsdom measures everything as zero, so the
     * overlay's contents are covered in the end-to-end lane where there is a real
     * layout to position against.
     */
    renderPage();
    const value = (await screen.findAllByRole('button', { name: /^Window: / }))[0] as HTMLElement;
    expect(value).toBeInstanceOf(HTMLButtonElement);
    expect(value.getAttribute('aria-label')).toMatch(/Change it\.$/);
  });
});
