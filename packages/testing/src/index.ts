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
  searchHandlers,
  whoamiHandlers,
} from './msw/handlers';
export {
  makeSession,
  makeTestQueryClient,
  renderWithProviders,
  type RenderWithProvidersOptions,
} from './renderWithProviders';
