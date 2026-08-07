import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeCapabilityDetail, makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CapabilityDetailPage } from '../CapabilityDetailPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderAt = (path: string, role: 'consumer' | 'producer' = 'consumer') =>
  renderWithProviders(
    <Routes>
      <Route path="/:handle" element={<CapabilityDetailPage />} />
      <Route path="/:handle/:tab" element={<CapabilityDetailPage />} />
    </Routes>,
    {
      session: makeSession({ role, personaKey: role }),
      client: createRegistryClient({
        baseUrl: 'http://localhost',
        getToken: () => tokenFor(`knowledge-ui-${role}`),
      }),
      route: path,
    },
  );

describe('a tab segment the page does not define', () => {
  it('redirects to the overview instead of rendering four unselected tabs over nothing', async () => {
    renderAt('/salt-design-system/claims');

    // The overview's own sections render, which is only possible after the
    // redirect: the unknown segment maps to no panel at all.
    expect(
      await screen.findByText('The attributes recorded against this capability.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });

  it('keeps the query string across the redirect', async () => {
    renderAt('/salt-design-system/usage?as_of=2026-01-01T00:00:00Z');

    // The historical note only renders when `as_of` survived the redirect.
    expect(await screen.findByText(/as it stood at 2026-01-01T00:00:00Z/)).toBeInTheDocument();
  });
});

/**
 * The registry has two sources for a contract: canonical published interface
 * text, and an `interface` attribute recorded on the capability. The tab must
 * never deny a contract another tab is displaying, and must never pass one
 * source off as the other.
 */
describe('the interface tab without canonical text', () => {
  it('renders the recorded interface attribute, labelled by its source', async () => {
    server.use(
      http.get('*/v1/capabilities/:handle', () =>
        HttpResponse.json(
          makeCapabilityDetail({
            attributes: {
              owner: 'payments-platform',
              display_name: 'Payments API',
              interface: { openapi: '3.1.0', paths: ['/v1/payments'] },
            },
          }),
        ),
      ),
      http.get('*/v1/capabilities/:handle/interface', () =>
        HttpResponse.json({ interface_format: 'openapi', interface_source: 'sync' }),
      ),
    );
    renderAt('/payments-api/interface');

    expect(
      await screen.findByText(
        /What follows is the interface attribute recorded on the capability itself/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('{"openapi":"3.1.0","paths":["/v1/payments"]}')).toBeInTheDocument();
    expect(
      screen.queryByText(/The provenance above is what was published/),
    ).not.toBeInTheDocument();
  });

  it('points at the provenance only when provenance actually rendered', async () => {
    server.use(
      http.get('*/v1/capabilities/:handle/interface', () =>
        HttpResponse.json({ interface_format: 'openapi', interface_source: 'sync' }),
      ),
    );
    renderAt('/salt-design-system/interface');

    expect(
      await screen.findByText(/The provenance above is what was published/),
    ).toBeInTheDocument();
    expect(screen.getByText('Interface format')).toBeInTheDocument();
  });

  it('states the absence plainly when there is neither text nor provenance', async () => {
    server.use(http.get('*/v1/capabilities/:handle/interface', () => HttpResponse.json({})));
    renderAt('/salt-design-system/interface');

    expect(
      await screen.findByText('The registry has no interface text recorded for this capability.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/provenance above/)).not.toBeInTheDocument();
  });
});
