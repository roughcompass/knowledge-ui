import { SaltProviderNext } from '@salt-ds/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import type { Session } from '@knowledge-ui/auth';

/**
 * Render a component inside the same provider stack the app uses.
 *
 * "The same stack" is the whole point. When the app's provider tree and the test
 * helper's drift apart — different order, a provider present in one and not the
 * other — tests pass against a tree that does not exist in production, and the
 * difference shows up as a bug nobody can reproduce locally. So the order here
 * mirrors the shell: theme outermost, then query cache, then router.
 *
 * A fresh QueryClient per call, with retries off: a retry in a test turns an
 * assertion failure into a timeout, which hides which request actually failed.
 */

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    actorId: 'actor-test',
    actorDisplayName: 'Test Actor',
    actorEmail: null,
    tenantId: 'tenant-test',
    tenantSlug: 'dev',
    tenantDisplayName: 'Local Development Tenant',
    role: 'consumer',
    personaKey: 'consumer',
    ...overrides,
  };
}

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = makeTestQueryClient(), ...renderOptions }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SaltProviderNext mode="light" density="medium" accent="blue" corner="rounded">
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </SaltProviderNext>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}
