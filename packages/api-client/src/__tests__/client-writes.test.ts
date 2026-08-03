import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TIMEOUT_MS, createRegistryClient } from '../client';
import { RegistryError } from '../errors';

/**
 * The write branches of `client.request`.
 *
 * These existed before anything used them: `RequestOptions.method` accepted
 * `POST | PUT | PATCH | DELETE`, `body` was JSON-encoded, `Content-Type` was set
 * conditionally and an empty body returned `undefined` — all written, none reached
 * by a single caller or test. The first mutation makes them load-bearing, so they
 * get covered here rather than discovered in a page.
 */

type FetchArgs = [input: string, init: RequestInit | undefined];

function stubFetch(response: Response) {
  const spy = vi.fn(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const lastCall = (spy: ReturnType<typeof stubFetch>): FetchArgs =>
  spy.mock.calls[spy.mock.calls.length - 1] as unknown as FetchArgs;

// `getToken` is required; returning nothing sends the request unauthenticated,
// which is all these assertions need.
const client = () => createRegistryClient({ baseUrl: '', getToken: () => undefined });

afterEach(() => vi.unstubAllGlobals());

describe('a request with a body', () => {
  it('sends the method, encodes the body and declares the content type', async () => {
    const spy = stubFetch(
      new Response(JSON.stringify({ source_id: 's1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const out = await client().request<{ source_id: string }>('/v1/admin/sync-sources', {
      method: 'POST',
      body: { display_name: 'docs', source_type: 'docs_corpus' },
    });

    const [, init] = lastCall(spy);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"display_name":"docs","source_type":"docs_corpus"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(out).toEqual({ source_id: 's1' });
  });

  it('omits the content type when there is no body', async () => {
    // A POST with no body is a real shape here — `trigger` is exactly that — and
    // declaring a JSON content type for an absent body is a lie some gateways
    // reject.
    const spy = stubFetch(new Response(null, { status: 204 }));

    await client().request('/v1/admin/sync-sources/s1/trigger', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': 'k1' },
    });

    const headers = new Headers(lastCall(spy)[1]?.headers);
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('X-Idempotency-Key')).toBe('k1');
  });

  it('distinguishes an absent body from an explicit null', async () => {
    const spy = stubFetch(new Response(null, { status: 204 }));
    await client().request('/x', { method: 'PATCH', body: null });
    expect(new Headers(lastCall(spy)[1]?.headers).get('Content-Type')).toBe('application/json');
    expect(lastCall(spy)[1]?.body).toBe('null');
  });
});

describe('an empty success response', () => {
  it('resolves rather than throwing on a 204', async () => {
    // Both soft deletes answer 204. Parsing an empty body as JSON throws, and the
    // caller would see a request that succeeded reported as a failure.
    stubFetch(new Response(null, { status: 204 }));
    await expect(client().request('/v1/admin/sync-sources/s1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('resolves on a 200 with an empty body', async () => {
    stubFetch(new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(client().request('/x', { method: 'PATCH', body: {} })).resolves.toBeUndefined();
  });
});

describe('a failed write', () => {
  it('throws a RegistryError carrying the per-field items a form needs', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          errors: [{ path: '$.display_name', code: 'missing', message: 'Field required' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      client().request('/v1/admin/sync-sources', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      name: 'RegistryError',
      status: 422,
      items: [{ path: '$.display_name', code: 'missing', message: 'Field required' }],
    });
  });

  it('surfaces the 409 the server raises for a trigger on an inactive source', async () => {
    // Reachable, unlike the idempotency-conflict 409, so the page has a bespoke
    // message for it.
    stubFetch(
      new Response(
        JSON.stringify({
          errors: [
            {
              path: null,
              code: 'conflict',
              message: 'sync_source is inactive; re-activate before triggering',
            },
          ],
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const error = await client()
      .request('/v1/admin/sync-sources/s1/trigger', { method: 'POST' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).status).toBe(409);
    expect((error as RegistryError).message).toMatch(/inactive/);
  });
});

/**
 * A fetch that never answers on its own.
 *
 * It settles only when the signal aborts, which is the behaviour under test. Note the
 * `signal.aborted` check first: `abort` does not re-fire for a signal that is *already*
 * aborted, and a caller can cancel before `fetch` is reached at all because
 * `buildHeaders` awaits a token first. Real `fetch` rejects immediately in that case; a
 * stub that only listens would hang, which would be a bug in the stub rather than in
 * the code under test.
 */
const hangingFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const fail = () => reject(new DOMException('aborted', 'AbortError'));
          if (init?.signal?.aborted) {
            fail();
            return;
          }
          init?.signal?.addEventListener('abort', fail);
        }),
    ),
  );

describe('a request that never answers', () => {
  it('fails on its deadline instead of hanging forever', async () => {
    /*
     * The defect this closes: `fetch` has no default timeout, so a connection that is
     * accepted and then never answered leaves the promise pending. React Query holds
     * such a query `isPending`, and the session bootstrap renders its spinner off
     * exactly that — so the whole app sat on "Resolving your session" with no error and
     * no way for the reader to learn why.
     *
     * The stub never resolves *on its own*; it resolves only when the composed signal
     * aborts, which is precisely the behaviour under test.
     */
    hangingFetch();

    const client = createRegistryClient({
      baseUrl: '',
      getToken: () => undefined,
      timeoutMs: 40,
    });

    const error = await client.request('/v1/whoami').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('timeout');
    // Status 0, like a network error: nothing came back, so there is no HTTP status to
    // report. The code is what tells the two apart.
    expect((error as RegistryError).status).toBe(0);
    expect((error as RegistryError).message).toMatch(/no response within/);
  });

  it("still reports a caller's own cancellation as an abort, not a timeout", async () => {
    // React Query aborts on unmount. That must stay distinguishable, or every
    // navigation away from a slow page would surface a spurious error.
    hangingFetch();

    const client = createRegistryClient({ baseUrl: '', getToken: () => undefined });
    const controller = new AbortController();
    const pending = client.request('/v1/whoami', { signal: controller.signal });
    controller.abort();

    const error = await pending.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(RegistryError);
    expect((error as DOMException).name).toBe('AbortError');
  });
});

describe('the deadline', () => {
  it('defaults low enough to beat the dev proxy, which answers 500 at ~15s', () => {
    /*
     * Measured, not assumed. With the API forward wedged, the proxy gave up at 15.33s
     * and answered 500 — so a 20s client deadline lost the race and the reader got
     * `internal_error · HTTP 500`, which names nothing actionable, after fifteen
     * seconds of blank spinner. The default has to come in under that.
     */
    expect(DEFAULT_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it('lets a single request ask for longer', async () => {
    // Create runs `connector.validate()` server-side, an outbound round trip. It
    // raises its own deadline rather than every read waiting for the worst case.
    hangingFetch();
    const client = createRegistryClient({
      baseUrl: '',
      getToken: () => undefined,
      timeoutMs: 20,
    });

    const started = Date.now();
    const error = await client
      .request('/v1/admin/sync-sources', { method: 'POST', body: {}, timeoutMs: 120 })
      .catch((e: unknown) => e);

    expect((error as RegistryError).code).toBe('timeout');
    // Held past the client default, so the per-request value won.
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });
});
