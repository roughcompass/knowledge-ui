/**
 * The one place a request to the registry is built.
 *
 * This is a plain object with two properties, not a Proxy over the generated
 * `paths` type. A Proxy buys terse call sites and costs everything else: the
 * stack trace of a failed call points at the trap rather than the caller,
 * `console.log(client)` shows nothing useful, and a typo in a method name is a
 * runtime `undefined is not a function` instead of a compile error. Endpoint
 * shapes live in the hooks, where they are read alongside the query keys.
 *
 * Nothing here knows about React, routing or storage. A 401 is reported, never
 * acted upon — see `onUnauthenticated`.
 */
import { RegistryError, toNetworkError, toRegistryError } from './errors';

/** Values a query parameter may hold. An array repeats the key. */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  signal?: AbortSignal;
  /** Merged last, so a caller can override `Accept` for a non-JSON endpoint. */
  headers?: Record<string, string>;
  /** JSON-encoded when present. Absent and `null` are different: `null` is a body. */
  body?: unknown;
}

export interface RegistryClientOptions {
  /**
   * Prefix for every path. Empty string — the normal case — yields relative
   * URLs; see the comment on `buildUrl`.
   */
  baseUrl?: string;
  /**
   * The bearer token for the current principal. Async because minting one is a
   * round trip to the token endpoint, and the caller may be refreshing.
   * Returning nothing sends the request unauthenticated, which is correct for
   * the ops endpoints and produces a 401 everywhere else.
   */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  /** The tenant the user explicitly selected, or nothing until they have. */
  getTenantSlug?: () => string | null | undefined;
  /** Notified on a 401. Must not navigate — see `notifyUnauthenticated`. */
  onUnauthenticated?: () => void;
}

export interface RegistryClient {
  /** Exposed so the ops probes, which bypass this client, can reach the same origin. */
  readonly baseUrl: string;
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

/**
 * Serialise query parameters.
 *
 * Empty string is dropped along with undefined and null because it is what a
 * cleared filter input produces, and `?lifecycle=` is not the same request as
 * `?` — the server treats the empty string as a filter value and returns
 * nothing. Dropping it here means the UI can bind an input straight to a param
 * without a guard at every call site.
 */
function serialiseQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue;
        search.append(key, String(entry));
      }
      continue;
    }
    search.append(key, String(value));
  }
  return search.toString();
}

/**
 * Concatenate rather than `new URL(path, base)`.
 *
 * `new URL` demands an absolute base, and the base here is usually empty: the
 * registry publishes no CORS headers, so a browser cannot call it cross-origin
 * at all and every dev and preview server proxies the API paths from its own
 * origin. Relative URLs are what makes that work — and they are what makes a
 * federated remote work too, since code loaded from a remote executes on the
 * shell's page and its relative fetches resolve against the shell's origin.
 */
function buildUrl(baseUrl: string, path: string, query: QueryParams | undefined): string {
  const qs = serialiseQuery(query);
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

/** An abort is the caller's own doing, so it must not be dressed up as a failure. */
function isAbort(cause: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return cause instanceof Error && cause.name === 'AbortError';
}

export function createRegistryClient(options: RegistryClientOptions): RegistryClient {
  const { baseUrl = '', getToken, getTenantSlug, onUnauthenticated } = options;

  /**
   * Latched so a burst of parallel 401s produces one notification.
   *
   * A page mounting four queries against an expired token gets four 401s within
   * a few milliseconds. Without the latch that is four sign-in prompts for one
   * expired token. Cleared on the next response that succeeds, so a later
   * expiry is reported again.
   */
  let unauthenticatedNotified = false;

  /**
   * Report, do not act.
   *
   * Navigating from here — pushing `/signin`, reloading, clearing storage — is
   * what makes an I/O layer untestable: every test that exercises an error path
   * has to stub a router, and a background poll can yank the user off the page
   * they are reading. The host listens and decides what a 401 means for the
   * screen that is mounted.
   */
  function notifyUnauthenticated(): void {
    if (unauthenticatedNotified) return;
    unauthenticatedNotified = true;
    onUnauthenticated?.();
  }

  async function buildHeaders(
    extra: Record<string, string> | undefined,
    hasBody: boolean,
  ): Promise<Headers> {
    const headers = new Headers({ Accept: 'application/json' });
    if (hasBody) headers.set('Content-Type', 'application/json');

    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    /**
     * Only after an explicit tenant choice.
     *
     * The header is an assertion, not a hint: a principal holding one grant that
     * sends `X-Tenant-ID` for anything other than that grant's tenant gets a
     * 403, and the request is refused rather than falling back to the tenant it
     * does hold. Sending nothing lets the server resolve the single grant
     * itself, which is the right answer for four of the five personas.
     */
    const tenantSlug = getTenantSlug?.();
    if (tenantSlug) headers.set('X-Tenant-ID', tenantSlug);

    for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);
    return headers;
  }

  async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const { method = 'GET', query, signal, headers: extraHeaders, body } = requestOptions;
    const hasBody = body !== undefined;
    const headers = await buildHeaders(extraHeaders, hasBody);

    let res: Response;
    try {
      res = await fetch(buildUrl(baseUrl, path, query), {
        method,
        headers,
        signal,
        body: hasBody ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      if (isAbort(cause, signal)) throw cause;
      throw toNetworkError(cause);
    }

    // The body may fail to arrive even after the headers did — a dropped
    // connection mid-stream throws from the reader, not from fetch.
    let text: string;
    try {
      text = await res.text();
    } catch (cause) {
      if (isAbort(cause, signal)) throw cause;
      throw toNetworkError(cause);
    }

    if (!res.ok) {
      if (res.status === 401) notifyUnauthenticated();
      throw toRegistryError(res.status, parseJsonOrUndefined(text), res.headers);
    }

    unauthenticatedNotified = false;

    // 204 on a delete, and 200 with an empty body from anything sitting behind
    // a proxy that strips it. Callers of those endpoints declare `void`.
    if (res.status === 204 || text.trim() === '') return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      // A successful status with an unreadable body is still a failure, and it
      // is worth its own code: this is what a proxy error page looks like when
      // the proxy answers 200.
      throw new RegistryError(res.status, [
        {
          path: null,
          code: 'invalid_response',
          message: `the response body was not JSON (${text.slice(0, 120)})`,
        },
      ]);
    }
  }

  return { baseUrl, request };
}

function parseJsonOrUndefined(text: string): unknown {
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
