/**
 * Environment-neutral exports only.
 *
 * The two MSW entry points are deliberately NOT re-exported here. `msw/node`
 * reaches for `async_hooks` and `@mswjs/interceptors/ClientRequest`, so a browser
 * bundle that follows this barrel fails to build even if it only wanted the
 * worker. They are separate subpaths instead:
 *
 *   import { server } from '@knowledge-ui/testing/server';   // Node, component tests
 *   import { startWorker } from '@knowledge-ui/testing/browser'; // service worker
 */
export * from './fixtures';
export { scenarios } from './msw/scenarios';
export {
  auditHandlers,
  capabilityHandlers,
  defaultHandlers,
  idpHandlers,
  opsHandlers,
  roleFor,
  searchHandlers,
  whoamiHandlers,
} from './msw/handlers';

/**
 * `resetAdminStore` belongs in test teardown. The sync handlers keep module state
 * so a POST is visible to the next GET, and `server.resetHandlers()` does not
 * clear it.
 */
export { adminSyncHandlers, resetAdminStore } from './msw/adminSync';
export { consumerHandlers, resetConsumerStore, seedAdoption } from './msw/consumer';
export { CLAIMS, impactHandlers, memoryHandlers } from './msw/memoryAndImpact';
export {
  makeSession,
  makeTestQueryClient,
  renderWithProviders,
  type RenderWithProvidersOptions,
} from './renderWithProviders';
