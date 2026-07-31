/**
 * The registry's error envelope, hand-written.
 *
 * These types are deliberately not generated. The OpenAPI document describes
 * every non-2xx response as FastAPI's default `HTTPValidationError`
 * (`{detail: ValidationError[]}`), which is not what the server actually
 * returns for any status we care about. Importing a generated error type would
 * mean writing narrowing code against a shape that never arrives.
 *
 * The real envelope is:
 *
 *     { "errors": [ { "path": string | null, "code": string, "message": string } ] }
 *
 * with `code` a stable snake_case identifier. Some items carry extra keys — the
 * tenant-selection error attaches `available_tenants` — which the server passes
 * through verbatim, so the item type stays open.
 */

/** Stable error codes worth branching on. Any other string is still valid. */
export type KnownErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'invalid_cursor'
  | 'tenant_required'
  | 'page_param_deprecated'
  | 'conflict'
  | 'internal_error'
  // Client-side only: a fetch that never reached the server.
  | 'network_error';

export interface ErrorItem {
  path: string | null;
  code: KnownErrorCode | (string & {});
  message: string;
  /**
   * Present on `tenant_required`. Note it lives on the *item*, not at the
   * envelope root — the server merges unrecognised keys into the item.
   */
  available_tenants?: string[];
  [key: string]: unknown;
}

export interface ErrorEnvelope {
  errors: ErrorItem[];
}

/** A normalised API failure. Everything the UI branches on is on this object. */
export class RegistryError extends Error {
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  readonly items: ErrorItem[];
  /** Convenience: the first item's code, which is what callers almost always want. */
  readonly code: string;
  /** From the `Retry-After` header on a 429, in seconds. */
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, items: ErrorItem[], retryAfterSeconds?: number) {
    const first = items[0];
    super(first?.message ?? `request failed with status ${status}`);
    this.name = 'RegistryError';
    this.status = status;
    this.items = items;
    this.code = first?.code ?? 'unknown';
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Tenants offered by a `tenant_required` refusal, read off the first item. */
  get availableTenants(): string[] {
    for (const item of this.items) {
      if (Array.isArray(item.available_tenants)) return item.available_tenants;
    }
    return [];
  }

  is(code: string): boolean {
    return this.items.some((i) => i.code === code);
  }
}

function isEnvelope(body: unknown): body is ErrorEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as { errors?: unknown }).errors)
  );
}

/**
 * Build a `RegistryError` from whatever the server sent.
 *
 * Falls back through three shapes because not every failure comes from the
 * application: the envelope, FastAPI's bare `{detail}` (which some framework-level
 * refusals still produce), and finally nothing parseable at all — a proxy error
 * page, an empty body, HTML from a gateway.
 */
export function toRegistryError(status: number, body: unknown, headers?: Headers): RegistryError {
  const retryAfterRaw = headers?.get('Retry-After');
  const retryAfter = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : undefined;
  const retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : undefined;

  if (isEnvelope(body)) {
    return new RegistryError(status, body.errors, retryAfterSeconds);
  }

  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') {
    return new RegistryError(status, [{ path: null, code: defaultCodeFor(status), message: detail }], retryAfterSeconds);
  }

  return new RegistryError(
    status,
    [{ path: null, code: defaultCodeFor(status), message: defaultMessageFor(status) }],
    retryAfterSeconds,
  );
}

/** A fetch that threw — DNS failure, connection refused, offline, CORS. */
export function toNetworkError(cause: unknown): RegistryError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new RegistryError(0, [
    {
      path: null,
      code: 'network_error',
      // Worth naming CORS explicitly: it is the most common cause here and the
      // browser deliberately gives JavaScript no way to tell it apart from a
      // network failure.
      message: `the request did not reach the server (${detail}). If this is a browser, the API may be on a different origin and it publishes no CORS headers.`,
    },
  ]);
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 412:
      return 'precondition_failed';
    case 422:
      return 'validation_error';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'request_failed';
  }
}

function defaultMessageFor(status: number): string {
  switch (status) {
    case 401:
      return 'not authenticated';
    case 403:
      return 'access denied';
    case 404:
      return 'not found';
    case 429:
      return 'rate limit exceeded';
    default:
      return `request failed with status ${status}`;
  }
}
