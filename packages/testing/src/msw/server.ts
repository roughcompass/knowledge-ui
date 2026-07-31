import { setupServer } from 'msw/node';

import { defaultHandlers } from './handlers';

/**
 * The Node-side interceptor for component tests.
 *
 * Callers must start it with `onUnhandledRequest: 'error'`. MSW v2 passes an
 * unmatched request through to the real network by default, which turns a
 * missing handler into a flaky test that sometimes reaches a real server.
 */
export const server = setupServer(...defaultHandlers);
