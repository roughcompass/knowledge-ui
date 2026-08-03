import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetAdminStore } from '../msw/adminSync';
import { server } from '../msw/server';

/**
 * The mock's identity chain.
 *
 * These handlers are the only backend the mocked end-to-end lane has, so a gap
 * in their fidelity is invisible in every test that depends on them. The chain
 * under test is the one the real stack implements: the requested `client_id`
 * becomes the token's `sub`, the entitlement lookup is keyed by `sub`, and the
 * resolved role decides what the audit endpoint returns.
 *
 * It is worth pinning because it was wrong in a way nothing failed on. A
 * hardcoded subject meant every persona minted a consumer token, so switching
 * identity changed a label in the header and nothing else — and the audit log,
 * the one screen whose whole design exists to explain a role boundary, could
 * never be shown working.
 */

const IDP = 'http://api.test/__idp/default/token';
const WHOAMI = 'http://api.test/v1/whoami';
const AUDIT = 'http://api.test/v1/admin/audit';
const SOURCES = 'http://api.test/v1/admin/sync-sources';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // The sync handlers hold a module-scoped store so a POST is visible to the next
  // GET; `resetHandlers` does not touch module state.
  resetAdminStore();
});
afterAll(() => server.close());

async function mint(clientId: string): Promise<string> {
  const res = await fetch(IDP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: 'dev-secret',
      scope: 'registry',
    }),
  });
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

const claims = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString()) as Record<string, unknown>;

const whoamiAs = async (token: string, tenant?: string) =>
  fetch(WHOAMI, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    },
  });

describe('the token endpoint', () => {
  it('echoes the requested client_id into sub, as client_credentials does', async () => {
    const token = await mint('knowledge-ui-auditor');
    expect(claims(token).sub).toBe('knowledge-ui-auditor');
  });

  it('carries an exp the client can read', async () => {
    const token = await mint('knowledge-ui-consumer');
    expect(claims(token).exp).toBeGreaterThan(Date.now() / 1000);
  });
});

describe('whoami resolves a role from the token subject', () => {
  it.each([
    ['knowledge-ui-consumer', 'consumer'],
    ['knowledge-ui-producer', 'producer'],
    ['knowledge-ui-admin', 'admin'],
    ['knowledge-ui-auditor', 'auditor'],
  ])('%s -> %s', async (clientId, expected) => {
    const res = await whoamiAs(await mint(clientId));
    const body = (await res.json()) as { roles: string[] };
    expect(res.status).toBe(200);
    // Always exactly one: the server collapses grants by precedence before
    // responding, which is the reason admin cannot read the audit log.
    expect(body.roles).toEqual([expected]);
  });

  it('defaults to consumer when there is no bearer token', async () => {
    const res = await fetch(WHOAMI);
    const body = (await res.json()) as { roles: string[] };
    expect(body.roles).toEqual(['consumer']);
  });
});

describe('the two-grant identity', () => {
  it('is refused until a tenant is chosen, with the choices inside errors[0]', async () => {
    const res = await whoamiAs(await mint('knowledge-ui-multi'));
    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      errors: Array<{ code: string; available_tenants?: string[] }>;
    };
    expect(body.errors[0]?.code).toBe('tenant_required');
    // Inside the error item, not at the envelope root. Reading it from the root
    // yields undefined and an empty tenant picker.
    expect(body.errors[0]?.available_tenants).toContain('dev');
  });

  it('resolves once X-Tenant-ID names one, and reports the chosen slug', async () => {
    const res = await whoamiAs(await mint('knowledge-ui-multi'), 'dev-secondary');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenant_slug: string; roles: string[] };
    expect(body.tenant_slug).toBe('dev-secondary');
    expect(body.roles).toEqual(['consumer']);
  });
});

describe('the audit endpoint requires auditor exactly', () => {
  it.each(['knowledge-ui-consumer', 'knowledge-ui-producer', 'knowledge-ui-admin'])(
    'refuses %s with 403',
    async (clientId) => {
      const res = await fetch(AUDIT, {
        headers: { authorization: `Bearer ${await mint(clientId)}` },
      });
      expect(res.status).toBe(403);
    },
  );

  it('serves rows to the auditor', async () => {
    const res = await fetch(AUDIT, {
      headers: { authorization: `Bearer ${await mint('knowledge-ui-auditor')}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('reports a bad cursor as 422, unlike the list endpoints 400', async () => {
    const res = await fetch(`${AUDIT}?cursor=not-base64`, {
      headers: { authorization: `Bearer ${await mint('knowledge-ui-auditor')}` },
    });
    expect(res.status).toBe(422);
  });
});

describe('the sync endpoints require admin exactly', () => {
  it.each(['knowledge-ui-consumer', 'knowledge-ui-producer', 'knowledge-ui-auditor'])(
    'refuses %s with 403',
    async (clientId) => {
      /*
       * Gating the mock matters more here than it looks. Without it the mocked lane
       * would imply a permission the server does not grant, and the page test that
       * asserts a producer sees a refusal would pass because the *page* refused —
       * not because the API did. Two different bugs, one green tick.
       */
      const res = await fetch(SOURCES, {
        headers: { authorization: `Bearer ${await mint(clientId)}` },
      });
      expect(res.status).toBe(403);
    },
  );

  it('serves the admin a bare array, not a paged envelope', async () => {
    const res = await fetch(SOURCES, {
      headers: { authorization: `Bearer ${await mint('knowledge-ui-admin')}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as unknown;
    // The shape that decided the whole slice: no `items`, no `next_cursor`. A page
    // written against an envelope would render nothing and look like an empty tenant.
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });
});

describe('the sync store is stateful, and reset between tests', () => {
  it('shows a created source to the next read', async () => {
    const auth = { authorization: `Bearer ${await mint('knowledge-ui-admin')}` };
    const created = await fetch(SOURCES, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'new-thing', source_type: 'docs_corpus' }),
    });
    expect(created.status).toBe(201);

    const after = (await (await fetch(SOURCES, { headers: auth })).json()) as Array<{
      display_name: string;
    }>;
    expect(after.map((s) => s.display_name)).toContain('new-thing');
  });

  it('does not leak that source into this test', async () => {
    // The assertion that proves `resetAdminStore` is wired. Without it this reads 4.
    const auth = { authorization: `Bearer ${await mint('knowledge-ui-admin')}` };
    const body = (await (await fetch(SOURCES, { headers: auth })).json()) as unknown[];
    expect(body).toHaveLength(3);
  });

  it('answers 202 for a trigger, with an id that matches no run', async () => {
    const auth = { authorization: `Bearer ${await mint('knowledge-ui-admin')}` };
    const sources = (await (await fetch(SOURCES, { headers: auth })).json()) as Array<{
      source_id: string;
      is_active: boolean;
    }>;
    const active = sources.find((s) => s.is_active) as { source_id: string };

    const res = await fetch(`${SOURCES}/${active.source_id}/trigger`, {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBe(202);

    const receipt = (await res.json()) as { sync_run_id: string; status: string };
    expect(receipt.status).toBe('queued');

    /*
     * The receipt's id is minted for the response and matches no row — the run is
     * written later by the scheduler. Reproduced because a page that links the
     * receipt to a run detail route is the most likely mistake in this area, and a
     * mock that inserted a row would make that mistake look correct.
     */
    const lookup = await fetch(`http://api.test/v1/admin/sync-runs/${receipt.sync_run_id}`, {
      headers: auth,
    });
    expect(lookup.status).toBe(404);
  });

  it('refuses a trigger on an inactive source with the 409 the server sends', async () => {
    const auth = { authorization: `Bearer ${await mint('knowledge-ui-admin')}` };
    const sources = (await (await fetch(SOURCES, { headers: auth })).json()) as Array<{
      source_id: string;
      is_active: boolean;
    }>;
    const inactive = sources.find((s) => !s.is_active) as { source_id: string };

    const res = await fetch(`${SOURCES}/${inactive.source_id}/trigger`, {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: Array<{ message: string }> };
    expect(body.errors[0]?.message).toMatch(/inactive/);
  });
});
