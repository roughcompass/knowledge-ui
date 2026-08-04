import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders, resetConsumerStore } from '@knowledge-ui/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { SubscriptionPanel } from '../SubscriptionPanel';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderPanel = (handle = 'salt-ds', role: 'producer' | 'consumer' = 'consumer') =>
  renderWithProviders(<SubscriptionPanel handle={handle} />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });

beforeEach(() => {
  resetConsumerStore();
});

describe('the empty state', () => {
  it('says what the absence means, not just that there is nothing', async () => {
    renderPanel();
    // "No subscriptions" states a row count. "You will not be told when this
    // capability changes" states the consequence, which is the thing a reader
    // is actually deciding about.
    expect(
      await screen.findByText(/will not be told when this capability changes/),
    ).toBeInTheDocument();
  });
});

describe('subscribing', () => {
  it('creates a subscription and shows it', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Subscribe' }));

    await waitFor(async () => {
      expect(await screen.findByText('version_published')).toBeInTheDocument();
    });
  });

  it('refuses to subscribe to nothing', async () => {
    const user = userEvent.setup();
    renderPanel();

    // Unchecking the only selected kind must disable the action rather than
    // POSTing an empty event_kinds, which the server would accept and which
    // would then never fire — the same silent-no-op this vocabulary exists to
    // prevent.
    await user.click(await screen.findByRole('checkbox', { name: /version published/i }));
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
  });
});

describe('the auto-subscribe disclosure', () => {
  it('explains an unexplained row once one exists', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Subscribe' }));

    // Adopting creates a subscription and unadopting does not remove it, so a
    // reader can find a row here they never made. Without this line they would
    // reasonably conclude they subscribed and forgot.
    await waitFor(async () => {
      expect(
        await screen.findByText(/Adopting this capability creates an inbox subscription/),
      ).toBeInTheDocument();
    });
  });
});

describe('cancelling', () => {
  it('removes the subscription and returns to the empty state', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Subscribe' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(async () => {
      expect(
        await screen.findByText(/will not be told when this capability changes/),
      ).toBeInTheDocument();
    });
  });
});

describe('the named absence', () => {
  it('explains that delivery health is unmeasured rather than healthy', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Subscribe' }));

    // The distinction that matters: an enabled subscription which has failed
    // every delivery looks identical to one that has succeeded, so the panel
    // must not imply health from the enabled flag.
    await waitFor(async () => {
      expect(await screen.findByText(/Delivery health is not shown/)).toBeInTheDocument();
    });
    expect(screen.getByText(/no endpoint reads it back/)).toBeInTheDocument();
  });
});
