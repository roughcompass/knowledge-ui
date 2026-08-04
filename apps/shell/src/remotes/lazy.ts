import { lazy } from 'react';

/**
 * Lazy handles for each remote.
 *
 * These are the only `import()` calls that cross a federation boundary. Keeping
 * them in one module means the specifiers the plugin has to rewrite are all in one
 * place, and it is what makes the boundary aliasable: this workspace's test config
 * points these two specifiers at the remotes' own sources, so a mount test
 * exercises the component the shell would really have received.
 *
 * That alias did not exist for a while, and this comment claimed it did. The
 * boundary's only coverage was the built end-to-end lane, which proves a remote
 * entry loads from another origin and does not cheaply prove the props the host
 * passes are the props the remote accepts. Both are checked now, in different
 * lanes, and the difference between them is the point.
 */
export const CatalogRemote = lazy(() => import('catalog/App'));
export const OperationsRemote = lazy(() => import('operations/App'));
