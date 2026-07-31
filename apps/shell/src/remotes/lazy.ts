import { lazy } from 'react';

/**
 * Lazy handles for each remote.
 *
 * These are the only `import()` calls that cross a federation boundary. Keeping
 * them in one module means the specifiers the plugin has to rewrite are all in
 * one place, and the boundary is easy to alias away in tests — the test config
 * points these specifiers at the remote's source, which turns a mocked
 * boundary into a real host-to-remote integration test.
 */
export const CatalogRemote = lazy(() => import('catalog/App'));
export const OperationsRemote = lazy(() => import('operations/App'));
