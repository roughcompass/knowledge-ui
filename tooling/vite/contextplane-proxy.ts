import type { ProxyOptions } from 'vite';

const API = process.env.KUI_API_TARGET ?? 'http://localhost:8000';
const IDP = process.env.KUI_IDP_TARGET ?? 'http://localhost:8090';

/**
 * Same-origin proxy for the contextplane API and the local identity provider.
 *
 * Not dev-only, which is what its previous name claimed. All three `vite dev`
 * servers use it, all three `preview` servers use it, and the built end-to-end
 * lane runs entirely through the preview ones — so the proxy is in the path of
 * every request the test suite makes against a real backend, not just the ones a
 * developer makes by hand.
 *
 * The contextplane ships no CORS middleware, so a browser cannot call it
 * cross-origin at all — not even a simple GET, because the response carries no
 * `Access-Control-Allow-Origin` for the reader to see. Every dev and preview
 * server therefore proxies the API paths from its own origin, and the app
 * builds *relative* URLs (`VITE_API_BASE_URL=""`) so it never needs to know
 * the API's real origin.
 *
 * This matters twice over under module federation: code loaded from a remote
 * executes on the shell's page, so its relative fetches resolve against the
 * shell's origin and land on the shell's proxy. A remote only needs its own
 * proxy when it is being run standalone.
 *
 * `/__idp` is the token issuer. Proxying it removes a second CORS problem and
 * keeps the client-credentials round trip same-origin.
 *
 * Production has no proxy: deploy same-origin with the API, or put a reverse
 * proxy in front of both.
 */
export function contextplaneProxy(): Record<string, ProxyOptions> {
  return {
    '/v1': { target: API, changeOrigin: true },
    '/healthz': { target: API, changeOrigin: true },
    '/readyz': { target: API, changeOrigin: true },
    '/metrics': { target: API, changeOrigin: true },
    '/__idp': {
      target: IDP,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/__idp/, ''),
    },
  };
}
