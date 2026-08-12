import { SaltProviderNext } from '@salt-ds/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * The provider stack, in one place.
 *
 * `packages/testing`'s render helper wraps this same shape in this same order.
 * Keeping them identical is the point: when an app's tree and its test helper's
 * tree drift, tests pass against a structure that does not exist at runtime, and
 * the difference surfaces as a bug that cannot be reproduced in a test.
 */

/**
 * One QueryClient for the whole page, host and remotes alike.
 *
 * Created in state rather than at module scope: a module-level client is shared
 * across every test in a file and across a hot reload, so cache entries outlive
 * the thing that created them. Under federation it also matters that there is
 * exactly one — `@tanstack/react-query` is a singleton share and the host
 * provides the only client, so a remote's `useQuery` reads this cache.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Without this every mount refetches, which on a dashboard that mounts
        // several lists at once is a burst of identical requests.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Internal tool, always-on tab: refetching whenever the window regains
        // focus is noise rather than freshness.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // A 4xx will not become a 2xx by asking again, and retrying a 403
          // delays the explanation the reader needs. Only transport failures
          // and 5xx are worth a second attempt.
          const status = (error as { status?: unknown } | null)?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: 0 },
    },
  });
}

export function AppProviders({
  children,
  mode = 'light',
  queryClient,
}: {
  children: ReactNode;
  mode?: 'light' | 'dark';
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? makeQueryClient());

  return (
    // SaltProviderNext, not SaltProvider: the plain provider applies the legacy
    // theme, which exists for migrations. Light mode is the default but is set
    // explicitly so a nested provider — including one inside a remote that also
    // runs standalone — cannot silently change it.
    //
    // `density="low"`, not Salt's default `medium`. Density drives five separate
    // foundations at once — type scale, spacing, control size, corner radius and
    // layout gaps — and at medium this app rendered body text at 12px with
    // metadata at 10px, below the 14px body and 11px floor the design standard
    // requires. Low puts body at 14px, metadata at 12px, page titles at 32px and
    // table rows at 55px. It also scales the spacing unit 8px -> 12px, so every
    // `gap={n}` grows by half; that is intended, not a side effect to correct.
    //
    // `accent="teal"` is one of the two values theme-next supports, so this
    // needs no token overrides. One quirk worth knowing rather than chasing:
    // Salt hard-wires `--salt-status-info-*` to the blue ramp, so info banners
    // stay blue while every actionable, selectable and focus token goes teal.
    <SaltProviderNext
      mode={mode}
      density="low"
      accent="teal"
      corner="rounded"
      breakpoints={{ xs: 0, sm: 768, md: 1101, lg: 1280, xl: 1920 }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SaltProviderNext>
  );
}
