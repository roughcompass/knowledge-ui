import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { ClaimDetailPage } from '../ClaimDetailPage';

/**
 * The citation drill-in, checked on how it presents trust.
 *
 * The load-bearing assertions are about register: the trust value is a caution
 * a reader must not skim past, so it must not dress like the calm category
 * pills around it — and the citations card must not greet healthy evidence
 * with the word "violation", which belongs to the empty state where it is true.
 */

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderClaim = (claimId: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
    </Routes>,
    {
      route: `/claims/${claimId}`,
      session: makeSession({ role: 'consumer', personaKey: 'consumer' }),
      client: createRegistryClient({
        baseUrl: 'http://localhost',
        getToken: () => tokenFor('knowledge-ui-consumer'),
      }),
    },
  );

describe('the claim detail page', () => {
  it('marks the untrusted value as a caution, not one more category pill', async () => {
    renderClaim('claim-1');
    expect(await screen.findByText('untrusted')).toBeInTheDocument();
    // Salt's warning indicator carries its status as the accessible label.
    expect(screen.getByLabelText('warning')).toBeInTheDocument();
  });

  it('introduces healthy citations without the contract-violation warning', async () => {
    renderClaim('claim-1');
    expect(
      await screen.findByText(/Every claim the registry serves arrives with its citations/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contract violation/i)).not.toBeInTheDocument();
    // The evidence itself is on screen.
    expect(screen.getByText(/imported Dropdown from core/)).toBeInTheDocument();
  });
});
