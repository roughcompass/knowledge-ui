import { createRegistryClient } from '@knowledge-ui/api-client';
import {
  makeSession,
  renderWithProviders,
  resetConsumerStore,
  seedAdoption,
} from '@knowledge-ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdoptionControl } from '../AdoptionControl';

/**
 * The behaviour worth a DOM: that the control reads adoption state back from the
 * server rather than trusting its own last mutation.
 *
 * That distinction cannot be tested against a fixed handler — a stub that always
 * answers "adopted" would pass for a component that guessed correctly. So the MSW
 * store is stateful, and each test drives a real round trip.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

/**
 * Producer by default, because that is who the API lets adopt.
 *
 * `_adopt_required` in `adoptions.py` is `require_roles([ROLE_PRODUCER, ROLE_ADMIN])`
 * and excludes consumer outright, while `_list_adoptions_required` admits every
 * role. An earlier version of this file rendered as `consumer` and asserted the
 * Adopt button — it passed against MSW and would have 403'd against the real
 * service, which is a test certifying a broken thing.
 */
const renderControl = (handle = 'salt-ds', role: 'producer' | 'admin' | 'consumer' = 'producer') =>
  renderWithProviders(<AdoptionControl handle={handle} />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });

beforeEach(() => {
  resetConsumerStore();
});

describe('the role gate', () => {
  it('shows a consumer the state but not the action', async () => {
    // Every role may read adoption state; only producer and admin may change it.
    // Offering a button that is guaranteed to 403 is worse than not showing one.
    renderControl('salt-ds', 'consumer');
    // A disabled control rather than a sentence: the header's action slot holds
    // controls, and prose there sits at a different weight from the buttons
    // beside it. The affordance is still visibly refused.
    expect(await screen.findByRole('button', { name: 'Adopt Capability' })).toBeDisabled();
  });

  it('shows a consumer an existing adoption without an Unadopt button', async () => {
    seedAdoption('salt-ds', '3.2.0');
    renderControl('salt-ds', 'consumer');
    expect(await screen.findByText(/pinned 3\.2\.0/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unadopt Capability' })).not.toBeInTheDocument();
  });
});

describe('adoption state', () => {
  it('offers Adopt when the server reports no adoption', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: 'Adopt Capability' })).toBeInTheDocument();
  });

  it('offers Unadopt, and names the pin, when the server reports one', async () => {
    seedAdoption('salt-ds', '3.2.0');
    renderControl();

    expect(await screen.findByRole('button', { name: 'Unadopt Capability' })).toBeInTheDocument();
    // The pin is part of the state, not decoration: a reader needs to know which
    // version they are declaring a dependency on, not merely that they declared one.
    expect(screen.getByText(/pinned 3\.2\.0/)).toBeInTheDocument();
  });

  it('does not offer Adopt while the read is still in flight', async () => {
    renderControl();
    // Rendering "Adopt" during the read would offer an action that may be wrong a
    // moment later, and the label flipping under the cursor is what makes a reader
    // stop trusting the page.
    expect(screen.getByRole('button', { name: 'Checking Adoption…' })).toBeDisabled();
    await screen.findByRole('button', { name: 'Adopt Capability' });
  });
});

describe('adopting', () => {
  it('re-reads from the server rather than assuming the write stuck', async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByRole('button', { name: 'Adopt Capability' }));

    // The control must arrive at Unadopt via a refetch of the adoption read. The
    // mutation response is deliberately not seeded into the cache, so this only
    // passes if the invalidation actually happened.
    expect(await screen.findByRole('button', { name: 'Unadopt Capability' })).toBeInTheDocument();
  });
});

describe('unadopting', () => {
  it('confirms first, and says what is preserved', async () => {
    const user = userEvent.setup();
    seedAdoption('salt-ds');
    renderControl();

    await user.click(await screen.findByRole('button', { name: 'Unadopt Capability' }));

    // The dialog has to say that the record survives in the audit log. Without
    // that, "Unadopt" reads as a deletion and a reader hesitates over a
    // reversible, audited action.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/preserved in the audit log/)).toBeInTheDocument();

    /*
     * And that the auto-created subscription survives. `AdoptionService` is wired
     * with `subscriptions.adoption_hook()`, so adopting creates an inbox
     * subscription and `unadopt` -- which only soft-deletes the adoption row --
     * leaves it in place. A dialog that omits this describes the action as
     * cleaner than it is.
     */
    expect(screen.getByText(/keep receiving notifications/)).toBeInTheDocument();
  });

  it('returns to Adopt once the server confirms', async () => {
    const user = userEvent.setup();
    seedAdoption('salt-ds');
    renderControl();

    /*
     * The trigger and the dialog's confirm now carry the same label, which is
     * correct — a destructive action and its confirmation should name the same thing,
     * and a confirm reading only "Unadopt" beside a heading that already asks the
     * question is the bare-verb shape the copy rules reject. So the second click is
     * scoped to the dialog rather than found by name alone.
     */
    await user.click(await screen.findByRole('button', { name: 'Unadopt Capability' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Unadopt Capability' }));

    await waitFor(async () => {
      expect(await screen.findByRole('button', { name: 'Adopt Capability' })).toBeInTheDocument();
    });
  });
});
