import { LinkAdapterProvider } from '@knowledge-ui/ui-kit';
import { useHref, useNavigate } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';

/**
 * Teaches ui-kit's `KLink` to use this bundle's router.
 *
 * ui-kit renders every anchor in the app but takes no dependency on react-router,
 * so the router is handed to it here. See `LinkAdapter.tsx` in ui-kit for why the
 * adapter carries a hook rather than a plain function — relative links like
 * `../${slug}` need the route they are rendered under, and react-router exposes that
 * only as `useHref`.
 *
 * **This file exists three times: here, in the catalog remote, and in the operations
 * remote. That is not duplication to be tidied away.** Workspace packages are
 * deliberately excluded from the federation share contract, so each remote carries
 * its own copy of ui-kit, and a React context is identified by object identity — the
 * context created inside the shell's copy is a different object from the one inside
 * each remote's copy. A provider mounted only here would be invisible to every
 * component in a remote, and every link over there would quietly become a full page
 * load. Each bundle installs its own, exactly as each already installs its own
 * session provider.
 *
 * Mounted around the whole route tree rather than inside the app frame, because the
 * not-found route is a sibling of the frame and its own link would otherwise be the
 * one unstyled anchor left in the app.
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
