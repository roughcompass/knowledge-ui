/**
 * Resolve the router basename at runtime rather than baking it in at build
 * time.
 *
 * The same built artefact needs to mount at `/` when served on its own and
 * under something like `/knowledge/` when placed behind a shared reverse proxy.
 * Baking the prefix into the bundle would mean one build per mount point, and
 * the mount point is an operational decision that tends to change after the
 * build exists.
 *
 * Resolution order, most specific first:
 *   1. a `<meta name="app-basename">` tag, which a deploy step or a proxy can
 *      rewrite in the served HTML;
 *   2. `window.__APP_BASENAME__`, for a host that injects a script tag instead;
 *   3. the build-time base, for the ordinary root-mounted case.
 *
 * An un-substituted `{{...}}` placeholder counts as "not set". Without that
 * check, a template that reached production un-rewritten would route every URL
 * under a literal `/{{APP_BASENAME}}` and nothing would resolve — a failure
 * that looks like a routing bug rather than a deploy bug.
 */
export function resolveBasename(): string {
  const meta = document.querySelector('meta[name="app-basename"]')?.getAttribute('content');
  const fromMeta = meta && !meta.startsWith('{{') ? meta : undefined;
  const fromGlobal = (globalThis as { __APP_BASENAME__?: string }).__APP_BASENAME__;

  const raw = fromMeta ?? fromGlobal ?? import.meta.env.BASE_URL ?? '/';

  // React Router wants no trailing slash, except for the root where '/' is the
  // only valid spelling.
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Join the basename onto an app-absolute path.
 *
 * Needed for links that leave the router — a full page load, an anchor a user
 * might copy — where React Router will not prepend the basename for us.
 */
export function withBasename(basename: string, path: string): string {
  if (basename === '/') return path;
  return `${basename}${path.startsWith('/') ? path : `/${path}`}`;
}
