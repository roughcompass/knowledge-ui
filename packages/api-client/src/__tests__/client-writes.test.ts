import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRegistryClient } from '../client';
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
