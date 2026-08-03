import { createRegistryClient } from '@knowledge-ui/api-client';
import {
  makeSession,
  renderWithProviders,
  resetConsumerStore,
  seedAdoption,
} from '@knowledge-ui/testing';
import { screen, waitFor } from '@testing-library/react';
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

const renderControl = (handle = 'salt-ds') =>
  renderWithProviders(<AdoptionControl handle={handle} />, {
    session: makeSession({ role: 'consumer', personaKey: 'consumer' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor('knowledge-ui-consumer'),
    }),
  });

beforeEach(() => {
  resetConsumerStore();
});

describe('adoption state', () => {
  it('offers Adopt when the server reports no adoption', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: 'Adopt' })).toBeInTheDocument();
  });

  it('offers Unadopt, and names the pin, when the server reports one', async () => {
    seedAdoption('salt-ds', '3.2.0');
    renderControl();

    expect(await screen.findByRole('button', { name: 'Unadopt' })).toBeInTheDocument();
    // The pin is part of the state, not decoration: a reader needs to know which
    // version they are declaring a dependency on, not merely that they declared one.
    expect(screen.getByText(/pinned 3\.2\.0/)).toBeInTheDocument();
  });

  it('does not offer Adopt while the read is still in flight', async () => {
    renderControl();
    // Rendering "Adopt" during the read would offer an action that may be wrong a
    // moment later, and the label flipping under the cursor is what makes a reader
    // stop trusting the page.
    expect(screen.getByRole('button', { name: 'Checking adoption…' })).toBeDisabled();
    await screen.findByRole('button', { name: 'Adopt' });
  });
});

describe('adopting', () => {
  it('re-reads from the server rather than assuming the write stuck', async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByRole('button', { name: 'Adopt' }));

    // The control must arrive at Unadopt via a refetch of the adoption read. The
    // mutation response is deliberately not seeded into the cache, so this only
    // passes if the invalidation actually happened.
    expect(await screen.findByRole('button', { name: 'Unadopt' })).toBeInTheDocument();
  });
});

describe('unadopting', () => {
  it('confirms first, and says what is preserved', async () => {
    const user = userEvent.setup();
    seedAdoption('salt-ds');
    renderControl();

    await user.click(await screen.findByRole('button', { name: 'Unadopt' }));

    // The dialog has to say that the record survives in the audit log. Without
    // that, "Unadopt" reads as a deletion and a reader hesitates over a
    // reversible, audited action.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/preserved in the audit log/)).toBeInTheDocument();
  });

  it('returns to Adopt once the server confirms', async () => {
    const user = userEvent.setup();
    seedAdoption('salt-ds');
    renderControl();

    await user.click(await screen.findByRole('button', { name: 'Unadopt' }));
    await user.click(await screen.findByRole('button', { name: 'Unadopt', hidden: false }));

    await waitFor(async () => {
      expect(await screen.findByRole('button', { name: 'Adopt' })).toBeInTheDocument();
    });
  });
});
