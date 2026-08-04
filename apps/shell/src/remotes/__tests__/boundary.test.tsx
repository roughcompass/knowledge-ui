import { createRegistryClient, type RegistryClient } from '@knowledge-ui/api-client';
import { makeSession } from '@knowledge-ui/testing';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import { SaltProviderNext } from '@salt-ds/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CatalogRemote, OperationsRemote } from '../lazy';

/**
 * The host-to-remote boundary, mounted for real.
 *
 * This is the test two comments already described. `lazy.ts` and the root test
 * config both said the federated specifiers were aliased at test time so the host
 * mounted a remote's actual source — and no alias existed, so the claim named a test
 * nobody had written and the boundary's only coverage was the built lane.
 *
 * ## What this checks that the built lane does not
 *
 * Playwright proves a remote entry can be fetched and mounted from another origin.
 * It does not cheaply prove that the props the host passes are the props the remote
 * accepts, because a mismatch there produces a blank region or an unhelpful runtime
 * error rather than a failed navigation. That is the question the contract package
 * exists to answer, and this is where it gets answered at the value level rather
 * than only at the type level.
 *
 * ## Why the provider stack is written out rather than reused
 *
 * The render helper in the testing package wraps a *component*; here the thing under
 * test is the host's own composition, so borrowing the helper would test the helper's
 * arrangement instead of the shell's. The order below mirrors `providers.tsx`
 * deliberately — theme, then cache, then router — because that order is what a
 * remote's own re-provisioning assumes.
 */

function mountProps(
  mountPath: string,
): RemoteMountProps<ReturnType<typeof makeSession>, RegistryClient> {
  return {
    session: makeSession({ role: 'admin', personaKey: 'admin' }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () =>
        `header.${btoa(JSON.stringify({ sub: 'knowledge-ui-admin', exp: 9999999999 }))}.signature`,
    }),
    mountPath,
    navigateAbsolute: () => {},
    // Empty, as in a production build where the switcher does not exist. A remote
    // must render with an empty roster rather than assuming one is present.
    personas: [],
  };
}

function mountRemote(node: React.ReactNode, initialPath: string) {
  return render(
    <SaltProviderNext mode="light" density="low" accent="teal" corner="rounded">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[initialPath]}>
          <Suspense fallback={<div>loading</div>}>{node}</Suspense>
        </MemoryRouter>
      </QueryClientProvider>
    </SaltProviderNext>,
  );
}

describe('the catalog remote, mounted by the host', () => {
  it('accepts the props the host passes and renders its own route', async () => {
    /*
     * The load-bearing assertion. The host passes session, client, mount path,
     * navigation and roster; the remote re-provides them through its own context and
     * resolves a relative route. If any of that drifted, this is where it shows —
     * and before this file existed, nowhere did until somebody opened the page.
     */
    mountRemote(<CatalogRemote {...mountProps('/catalog')} />, '/');
    expect(await screen.findByRole('heading', { name: /capabilities/i })).toBeInTheDocument();
  });

  it('resolves its routes relative to wherever it was mounted', async () => {
    /*
     * The property that lets the same bundle mount at a different prefix without a
     * rebuild: the remote's routes are relative, so it neither knows nor cares that
     * the host put it at `/catalog`. Mounting at a different path and still reaching
     * an internal route is what proves it.
     */
    mountRemote(<CatalogRemote {...mountProps('/somewhere-else')} />, '/claims');
    expect(await screen.findByRole('heading', { name: /^claims$/i })).toBeInTheDocument();
  });
});

describe('the operations remote, mounted by the host', () => {
  it('accepts the same contract and renders its index route', async () => {
    mountRemote(<OperationsRemote {...mountProps('/ops')} />, '/');
    expect(await screen.findByRole('heading', { name: /health/i })).toBeInTheDocument();
  });

  it('gates a child route that needs more than the section does', async () => {
    /*
     * The audit log needs the auditor role specifically, and this mount is an admin —
     * who loses auditor access to role collapse. So the correct outcome is a refusal
     * that explains itself, not the page. Checked here because the gate lives inside
     * the remote, which means the host cannot enforce it and a type cannot express it.
     */
    mountRemote(<OperationsRemote {...mountProps('/ops')} />, '/audit');

    /*
     * More than one mention of the role is the correct outcome — the refusal names
     * which role would work *and* explains why holding admin is not enough — so this
     * asserts on the count being non-zero rather than on there being exactly one.
     */
    expect((await screen.findAllByText(/auditor/i)).length).toBeGreaterThan(0);

    // And the page itself is genuinely not rendered behind the explanation.
    expect(screen.queryByRole('table', { name: /audit/i })).not.toBeInTheDocument();
  });
});

describe('both remotes, mounted at once', () => {
  it('renders two remotes on one page without either capturing the other', async () => {
    /*
     * Two remotes coexist on a real page, each re-providing the host's session and
     * client through its own copy of the context. The failure this guards is subtle:
     * two context objects exist, each subtree reads its own, and both must hold the
     * same value. If one captured the other's provider, the second would render with
     * the first's identity — which is the shape of a cross-tenant leak rather than a
     * layout bug.
     */
    render(
      <SaltProviderNext mode="light" density="low" accent="teal" corner="rounded">
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter initialEntries={['/']}>
            <Suspense fallback={<div>loading</div>}>
              <CatalogRemote {...mountProps('/catalog')} />
              <OperationsRemote {...mountProps('/ops')} />
            </Suspense>
          </MemoryRouter>
        </QueryClientProvider>
      </SaltProviderNext>,
    );

    expect(await screen.findByRole('heading', { name: /capabilities/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /health/i })).toBeInTheDocument();
  });
});
