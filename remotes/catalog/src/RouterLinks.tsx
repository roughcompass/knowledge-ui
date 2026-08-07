import { LinkAdapterProvider } from '@knowledge-ui/ui-kit';
import { useHref, useNavigate } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';

/**
 * Teaches ui-kit's `KLink` to use this bundle's router.
 *
 * **One of three identical installations — see the shell's copy at
 * `apps/shell/src/chrome/RouterLinks.tsx` for the full reasoning, and ui-kit's
 * `LinkAdapter.tsx` for why the adapter carries a hook.** The short version: this
 * remote carries its own copy of ui-kit, because workspace packages are excluded
 * from the federation share contract, and a React context is identified by object
 * identity. The shell's provider cannot reach this bundle's `KLink`. Deleting this
 * as redundant makes every link in the catalog a full page load, silently.
 *
 * A router is present in both modes this component renders in: federated, where the
 * host owns it, and standalone, where the harness mounts its own `BrowserRouter`.
 */
export function RouterLinks({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const value = useMemo(
    () => ({
      useResolveHref: useHref,
      navigate: (to: string, options?: { relative?: 'route' | 'path' }) => navigate(to, options),
    }),
    [navigate],
  );

  return <LinkAdapterProvider value={value}>{children}</LinkAdapterProvider>;
}
