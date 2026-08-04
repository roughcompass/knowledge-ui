import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders, scenarios } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SyncSourcesPage } from '../SyncSourcesPage';

/**
 * The four write-path behaviours that only exist in a DOM.
 *
 * Everything else about this feature is covered where it is cheaper: the error
 * mapping and the idempotency header are pure functions with unit tests, and the
 * federation boundary is covered by Playwright against the built artefacts. What is
 * left is the wiring — whether a 422 actually reaches the control it names, whether a
 * dialog closes on the right event, and whether a success actually refetches.
 *
 * These are the first rendering tests in the repo, so `renderWithProviders` and
 * `scenarios` get their first callers here after being written and left unused.
 */

/**
 * A real client, not a stub.
 *
 * The point of these tests is the round trip through MSW: request shape out, envelope
 * back, mapped onto controls. A stubbed client would assert the page against a fiction
 * of my own making. The token is what the mock's role resolver reads — the handlers
 * refuse anything that is not admin, mirroring `require_roles([ROLE_ADMIN])`.
 */
const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPage = (role: 'admin' | 'producer' = 'admin') =>
  renderWithProviders(<SyncSourcesPage />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });

describe('the create form', () => {
  it('puts a 422 on the field the server named', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add a source' }));
    await user.click(screen.getByRole('button', { name: 'Save Connector' }));

    /*
     * Two assertions, because either alone would pass while the feature is broken.
     * The count proves both named fields were mapped; the `aria-describedby` link
     * proves the message reached *that* control rather than merely appearing
     * somewhere on the page. The first version of this feature rendered a message
     * with no field associated at all, because `fieldErrors` used `instanceof`
     * across a bundle boundary and silently returned nothing.
     *
     * Note this asserts `aria-describedby`, not `aria-invalid`: Salt sets no
     * `aria-invalid` on a field with `validationStatus="error"` — see the note in
     * `FormRow`. Asserting the attribute Salt actually sets keeps this test honest
     * about what a screen reader receives today.
     */
    expect(await screen.findAllByText('Field required')).toHaveLength(2);

    const displayName = screen.getByRole('textbox', { name: /display name/i });
    await waitFor(() => {
      const describedBy = displayName.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toHaveTextContent('Field required');
    });
  });

  it('renders a path-less 422 above the form rather than dropping it', async () => {
    // The half of a validation failure with no field to attach to — an unknown
    // connector type, or a credential `connector.validate()` could not reach.
    server.use(...scenarios.syncSourceValidationFailed());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add a source' }));
    await user.click(screen.getByRole('button', { name: 'Save Connector' }));

    expect(await screen.findByText(/unknown connector type/i)).toBeInTheDocument();
    expect(screen.getByText('Could not save this source')).toBeInTheDocument();
  });

  it('closes and shows the new row on success', async () => {
    const user = userEvent.setup();
    renderPage();

    // Three seeded sources before the write.
    await waitFor(() => expect(screen.getByText('docs-corpus')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'nightly-adrs');
    await user.click(screen.getByRole('combobox', { name: /connector/i }));
    await user.click(await screen.findByRole('option', { name: 'markdown_adr_rfc' }));
    await user.click(screen.getByRole('button', { name: 'Save Connector' }));

    /*
     * The row is what proves the invalidation ran. The banner alone would pass with
     * no refetch at all, because the page sets it from `onSuccess` — so asserting
     * only the banner would have tested the message, not the cache.
     */
    expect(await screen.findByText('nightly-adrs')).toBeInTheDocument();
    expect(screen.getByText(/Added nightly-adrs/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Connector' })).not.toBeInTheDocument();
  });
});

describe('the confirm dialog', () => {
  it('stays open holding the error when the mutation fails, and closes on success', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('docs-corpus')).toBeInTheDocument());
    const row = screen.getByText('docs-corpus').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Scheduled runs stop immediately/)).toBeInTheDocument();

    // Fail the PATCH. The dialog must keep the message: closing and surfacing it
    // behind the reader is indistinguishable from the action having worked.
    server.use(...scenarios.forbidden('*/v1/admin/sync-sources/*'));
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate Connector' }));

    expect(await within(dialog).findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Now let it succeed, and only now does it close.
    server.resetHandlers();
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate Connector' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/Deactivated docs-corpus/)).toBeInTheDocument();
  });
});

describe('deactivation stays reversible', () => {
  it('keeps a deactivated source on screen, offering Reactivate', async () => {
    /*
     * The regression that shipped and was caught only against the live registry.
     *
     * `GET /v1/admin/sync-sources` is `active_only: bool = Query(True)` — it hides
     * inactive sources unless asked. The page omitted the parameter, so deactivating
     * a source removed it from the table, the Reactivate control became unreachable,
     * and the confirm dialog's "reversible from this table" was untrue.
     *
     * Every test passed at the time, because the mock defaulted the other way. Both
     * sides are now aligned to the server, and this pins the behaviour.
     */
    const user = userEvent.setup();
    renderPage();

    // The seeded roster includes one already-inactive source. Its presence is the
    // assertion: with the server's default it would not be here at all.
    expect(await screen.findByText('retired-adr-import')).toBeInTheDocument();
    const inactiveRow = screen.getByText('retired-adr-import').closest('tr') as HTMLElement;
    expect(within(inactiveRow).getByRole('button', { name: 'Reactivate' })).toBeVisible();
    expect(within(inactiveRow).getByRole('button', { name: 'Run now' })).toBeDisabled();

    // And a source deactivated during this session stays visible too.
    const activeRow = screen.getByText('docs-corpus').closest('tr') as HTMLElement;
    await user.click(within(activeRow).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate Connector' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('docs-corpus')).toBeInTheDocument();
    const afterRow = screen.getByText('docs-corpus').closest('tr') as HTMLElement;
    expect(within(afterRow).getByRole('button', { name: 'Reactivate' })).toBeVisible();
  });
});

describe('the capability gate', () => {
  it('refuses a producer and names the role that would work', async () => {
    // The page itself is unguarded — `GuardedAdmin` wraps it at the route. This
    // asserts the *server* half of the same boundary: every admin endpoint refuses a
    // producer, so a page rendered without the gate must still fail visibly rather
    // than showing an empty table that looks like a tenant with no connectors.
    renderPage('producer');

    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText('docs-corpus')).not.toBeInTheDocument();
  });
});
