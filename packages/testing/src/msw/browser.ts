import { setupWorker } from 'msw/browser';

import { defaultHandlers } from './handlers';

/**
 * The service-worker interceptor, for the end-to-end lane that runs without a
 * backend.
 *
 * Unlike the Node server this cannot error on every unhandled request: Vite's
 * own module and asset requests would all match. The predicate below narrows
 * strictness to the API surface, so a missing API handler is loud while the
 * page's own traffic passes through.
 */
export const worker = setupWorker(...defaultHandlers);

const API_PREFIXES = ['/v1', '/healthz', '/readyz', '/metrics', '/__idp'];

export function startWorker() {
  return worker.start({
    onUnhandledRequest(request, print) {
      const { pathname } = new URL(request.url);
      if (API_PREFIXES.some((p) => pathname.startsWith(p))) {
        print.error();
        return;
      }
      // Everything else is the app loading itself.
    },
  });
}
