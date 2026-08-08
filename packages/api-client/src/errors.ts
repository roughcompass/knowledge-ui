/**
 * The contextplane's error envelope, hand-written.
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
    return new RegistryError(
      status,
      [{ path: null, code: defaultCodeFor(status), message: detail }],
      retryAfterSeconds,
    );
  }

  return new RegistryError(
    status,
    [{ path: null, code: defaultCodeFor(status), message: defaultMessageFor(status) }],
    retryAfterSeconds,
  );
}

/**
 * A request that exceeded its deadline.
 *
 * Distinct from `network_error`, and the distinction is the useful part: a refused
 * connection means nothing is listening, while a timeout means something accepted the
 * connection and then went quiet. On this stack the second has a specific and common
 * cause worth naming, because "it spins forever" is otherwise unattributable.
 */
export function toTimeoutError(timeoutMs: number): RegistryError {
  return new RegistryError(0, [
    {
      path: null,
      code: 'timeout',
      message:
        `the server accepted the connection but sent no response within ${Math.round(timeoutMs / 1000)}s. ` +
        'It may be starting up, or a port forward between here and it may have stopped passing traffic.',
    },
  ]);
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

/**
 * Read the error envelope's items off anything that carries them.
 *
 * **Duck-typed, and it has to be.** `error instanceof RegistryError` is wrong here
 * and fails silently. `@knowledge-ui/api-client` is not a Module Federation share —
 * it is bundled into the shell *and* into each remote — so the client that throws
 * lives in the shell's copy while a page that catches lives in the remote's. The two
 * `RegistryError` classes are different objects, `instanceof` is false, and the
 * caller sees an error with no items at all.
 *
 * That cost real debugging time: the first version of `fieldErrors` used
 * `instanceof`, so a 422 whose items were all `$.`-pathed field errors came out as
 * zero field errors and one form-level message — the *opposite* of the truth, and
 * plausible enough to look like a server problem.
 *
 * `ErrorPanel` already learned this and says so in its own header comment. Same
 * boundary, same answer.
 */
function itemsOf(error: unknown): ErrorItem[] {
  if (typeof error !== 'object' || error === null) return [];
  const items = (error as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter((i): i is ErrorItem => typeof i === 'object' && i !== null && 'message' in i);
}

/**
 * Split a validation failure into per-field and form-level messages.
 *
 * The server's envelope carries `path` on each item — `"$.display_name"` for a
 * Pydantic body error, JSON-Path style with a `$.` root. That is what lets a 422
 * land on the control that caused it instead of in a banner above the form.
 *
 * Two shapes have to be handled, and the second is the one that gets forgotten:
 *
 *   `path: "$.display_name"`  a field error, from Pydantic's own validation
 *   `path: null`              a *form-level* error, from a hand-raised refusal
 *
 * `admin_sync.py` raises the second kind for an unknown connector type, and
 * `connector.validate()` runs inside the create request — so a credential the
 * connector cannot reach also arrives this way. A form that only ever renders
 * field errors would swallow both and show nothing at all.
 *
 * Note `code` is the Pydantic error *type* — `missing`, `string_too_short` — not a
 * contextplane error code. Do not switch on it expecting `validation_error`.
 */
export function fieldErrors(error: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  for (const item of itemsOf(error)) {
    if (typeof item.path !== 'string' || item.path === '') continue;
    // `$.display_name` → `display_name`; `$.config.url` → `config.url`.
    const field = item.path.replace(/^\$\.?/, '');
    if (field === '') continue;
    (out[field] ??= []).push(item.message);
  }
  return out;
}

/**
 * A thrown value that is neither envelope-shaped nor an `Error`, said out loud.
 *
 * Anything can be thrown in JavaScript, and whatever it is has to reach the form
 * or a failed submit renders as silence. The obvious `String(value)` does that for
 * a primitive and actively lies for an object, where it produces `[object Object]`
 * — a message that occupies the space an explanation should and tells the reader
 * nothing they can act on.
 *
 * So a primitive is quoted as-is and anything else is serialised. `JSON.stringify`
 * returning `undefined` covers the genuinely unrenderable cases (a function, a
 * bare symbol), which get a sentence saying the shape was unrecognised rather than
 * a blank where a reason belongs.
 */
function describeThrown(error: unknown): string[] {
  if (error === null || error === undefined) return [];
  if (typeof error === 'string') return [error];
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return [String(error)];
  }
  const serialised = typeof error === 'object' ? JSON.stringify(error) : undefined;
  return [serialised ?? 'The request failed and the reason was not in a recognisable shape.'];
}

/**
 * The messages that belong to no particular field.
 *
 * Everything with a null or empty `path`. Render these together above the controls;
 * they are the half of a 422 that has nowhere else to go.
 */
export function formErrors(error: unknown): string[] {
  const items = itemsOf(error);

  if (items.length === 0) {
    // Nothing envelope-shaped. A thrown Error still has to say something, or a
    // failed submit renders as silence.
    if (error instanceof Error) return [error.message];
    return describeThrown(error);
  }

  return items.filter((i) => typeof i.path !== 'string' || i.path === '').map((i) => i.message);
}
