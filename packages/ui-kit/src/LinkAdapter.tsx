import { Link, type LinkProps } from '@salt-ds/core';
import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

/**
 * The one anchor in the app, and the seam that lets it reach the router.
 *
 * Every inline link used to be react-router's `<Link>`, which renders a bare `<a>`.
 * Nothing in this repo styles an anchor — not Salt's `global.css`, not the next
 * theme, not this package's global sheet — so every one of them rendered at the user
 * agent's default: blue, underlined, purple once visited. In dark mode that is very
 * nearly black on black. Salt ships a `Link` that handles rest, hover, active, focus
 * and visited (the last through `--salt-content-foreground-visited`, a real token in
 * the shipped theme) plus the external-link icon and its visually-hidden text, and it
 * had zero consumers.
 *
 * So `KLink` is Salt's `Link`, and this context is how it learns to route.
 *
 * ## Why the adapter carries a hook
 *
 * ui-kit takes no dependency on react-router, for the same reason `NavCard` and
 * `SidebarBack` do not: it is imported by three bundles and a second router instance
 * is worse than the indirection.
 *
 * Resolving an href cannot be a plain function, because half the links in the app are
 * relative (`../${slug}` from a notifications row) and relative resolution needs the
 * route the link is rendered under. react-router exposes that only as `useHref`. So
 * the adapter carries the hook, and `KLink` calls it unconditionally on every render.
 * The rule that makes this safe is that a provider is installed at a bundle root and
 * never appears or disappears under a live component — install one anywhere else and
 * the hook count changes across renders.
 *
 * ## The trap: this provider is installed three times, and that is not duplication
 *
 * `@knowledge-ui/*` packages are deliberately not federated — the share contract
 * pins React, react-router, react-query and Salt as singletons and leaves the
 * workspace packages out, so each remote carries its own copy of ui-kit. A React
 * context is identified by object identity, so the context created inside the
 * shell's copy is a *different object* from the one inside the catalog remote's
 * copy. A provider mounted only in the shell is invisible to every component in a
 * remote, which would silently fall back to a full page load on every link.
 *
 * The shell and both remotes therefore each install this at their own root, exactly
 * as each already installs its own session provider. Deleting two of the three as
 * redundant is the failure this paragraph exists to prevent.
 *
 * A router is always present at those three roots: the host owns one, and each
 * standalone harness mounts its own `BrowserRouter`. The default below is therefore
 * a guard for an isolated unit render, not a supported mode.
 */
/**
 * `'route'` resolves against the matched route, `'path'` against the URL. The
 * difference matters for a `..` that should climb one URL segment rather than one
 * route — a receipt page at `/context/receipts/:id` linking back to `/context`.
 */
export type LinkRelative = 'route' | 'path';

type LinkAdapter = {
  /** A hook. Resolves an app-relative path against the basename and current route. */
  useResolveHref: (to: string, options?: { relative?: LinkRelative }) => string;
  /** Performs a client-side navigation to an app-relative path. */
  navigate: (to: string, options?: { relative?: LinkRelative }) => void;
};

const LinkAdapterContext = createContext<LinkAdapter>({
  useResolveHref: (to) => to,
  navigate: () => {
    // No router: leave the click alone and let the anchor do a real navigation.
  },
});

export function LinkAdapterProvider({
  value,
  children,
}: {
  value: LinkAdapter;
  children: ReactNode;
}) {
  return <LinkAdapterContext.Provider value={value}>{children}</LinkAdapterContext.Provider>;
}

export type KLinkProps = Omit<LinkProps, 'href'> & {
  /** An app-relative path. Resolved against the basename by the installed adapter. */
  to: string;
  /** Matches react-router's own prop of the same name. Defaults to `'route'`. */
  relative?: LinkRelative;
};

/**
 * An in-app link.
 *
 * Renders a real `<a>` with a real `href`, so middle-click, "copy link address" and
 * the screen-reader link role all work — the properties a `div` with an `onClick`
 * gives up. An unmodified left click is handed to the router; anything the browser
 * has a better answer for is left to the browser.
 *
 * Two presentations, both Salt's own API rather than a stylesheet:
 *
 * - prose and standalone links take the default, underlined at rest.
 * - dense contexts — a table cell, a list of ids — pass `underline="never"` with
 *   `color="accent"`, so a column of links does not become a wall of rules. Accent
 *   carries the affordance at rest, and the underline returns on hover, from one
 *   declaration in the global sheet.
 */
export function KLink({ to, relative, onClick, ...rest }: KLinkProps) {
  const { useResolveHref, navigate } = useContext(LinkAdapterContext);
  const href = useResolveHref(to, { relative });

  return (
    <Link
      {...rest}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // A new tab, a new window, a download, a middle click: the reader asked the
        // browser for something this app cannot do better.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
