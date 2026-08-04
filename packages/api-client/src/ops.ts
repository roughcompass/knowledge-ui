/**
 * Probes for the three unauthenticated operational endpoints.
 *
 * These deliberately bypass the typed client. Two reasons, and both are
 * properties of the server rather than preferences:
 *
 * 1. `/readyz` returns a bare body with **no `Content-Type` header**. A client
 *    that parses by content type has nothing to dispatch on, and calling
 *    `.json()` on `ok` throws.
 * 2. All three are unauthenticated and rate-limit exempt. Sending a bearer
 *    token would be pointless, and routing them through the shared error
 *    handling would let a 401 elsewhere trigger a token re-mint from a health
 *    poll.
 */

export type Readiness =
  | { state: 'ready' }
  | { state: 'not-ready'; detail: string }
  | { state: 'unreachable'; detail: string }
  | { state: 'unknown'; status: number; detail: string };

export type Liveness =
  | { state: 'ok' }
  | { state: 'degraded'; detail: string }
  | { state: 'unreachable'; detail: string };

export interface ProbeOptions {
  signal?: AbortSignal;
  /** Empty string means same-origin, which is how the app runs behind the dev proxy. */
  baseUrl?: string;
}

/**
 * `GET /healthz` — the only one of the three that returns JSON.
 * Body is `{"status": "ok"}`.
 */
export async function probeLiveness({
  baseUrl = '',
  signal,
}: ProbeOptions = {}): Promise<Liveness> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/healthz`, { signal, headers: { Accept: 'application/json' } });
  } catch (cause) {
    return { state: 'unreachable', detail: cause instanceof Error ? cause.message : String(cause) };
  }
  if (!res.ok) return { state: 'degraded', detail: `HTTP ${res.status}` };
  try {
    const body = (await res.json()) as { status?: string };
    return body.status === 'ok'
      ? { state: 'ok' }
      : { state: 'degraded', detail: String(body.status) };
  } catch {
    return { state: 'degraded', detail: 'response was not JSON' };
  }
}

/**
 * `GET /readyz` — plain text, no content type. 200 `ok`, or 503 `db unreachable`.
 *
 * Read as text, always. The body is trimmed because a trailing newline is not
 * a meaningful difference and depending on its absence would be brittle.
 */
export async function probeReadiness({
  baseUrl = '',
  signal,
}: ProbeOptions = {}): Promise<Readiness> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/readyz`, { signal, headers: { Accept: 'text/plain' } });
  } catch (cause) {
    return { state: 'unreachable', detail: cause instanceof Error ? cause.message : String(cause) };
  }
  const body = (await res.text()).trim();
  if (res.ok && body === 'ok') return { state: 'ready' };
  if (res.status === 503) return { state: 'not-ready', detail: body || 'not ready' };
  return { state: 'unknown', status: res.status, detail: body };
}

