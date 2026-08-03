import { HttpResponse, http } from 'msw';

import {
  METRICS_TEXT,
  makeAuditRow,
  makeCapabilityDetail,
  makeEntityRef,
  makeErrorEnvelope,
  makeSearchHit,
  makeWhoami,
} from '../fixtures';

/**
 * Default handlers: the happy path for every endpoint the app calls.
 *
 * Every pattern is origin-agnostic — a leading wildcard, then the path. The
 * same handlers run under
 * jsdom on http://localhost, inside a service worker on whatever origin the
 * preview server picked, and behind the dev proxy — pinning an origin would mean
 * every one of those needing its own base URL configured.
 *
 * Paging is implemented rather than faked, because the cursor stack is real
 * logic worth exercising. The cursor is an opaque base64 offset here, which
 * matches the contract the client must honour: it never parses one.
 */

const TOTAL = 47;

const encodeCursor = (offset: number) => btoa(JSON.stringify({ o: offset }));
const decodeCursor = (cursor: string | null): number => {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: number };
    return typeof parsed.o === 'number' ? parsed.o : 0;
  } catch {
    return -1; // signals an unusable cursor
  }
};

/**
 * client_id -> role, mirroring the entitlements the seeder installs.
 *
 * This exists so the mocked lane can exercise every persona. Under
 * `client_credentials` the real token's `sub` *is* the `client_id`, and the
 * entitlement service is keyed by `sub` — so the client_id chooses the identity
 * and the seeded entitlement chooses the role. Reproducing that chain here is
 * what makes a persona switch observable without a backend.
 *
 * A flat `makeWhoami()` for every token would quietly make the mocked lane blind
 * to the most important permission rule in the system: the audit log requires
 * `auditor` specifically, so a mock that always answers `consumer` can never show
 * that endpoint working, and can never catch a regression in the gate that hides
 * it.
 *
 * Mirrors the seeder rather than importing the persona roster: the roster is a
 * dev-only module behind a guarded dynamic import, and the server's behaviour is
 * what these handlers are imitating.
 */
const ROLE_BY_CLIENT_ID: Record<string, string> = {
  'knowledge-ui-consumer': 'consumer',
  'knowledge-ui-producer': 'producer',
  'knowledge-ui-admin': 'admin',
  'knowledge-ui-auditor': 'auditor',
  // Two tenant grants, one role. The interesting thing about this identity is the
  // tenant choice, not its permissions.
  'knowledge-ui-multi': 'consumer',
};

/** The `sub` claim of the bearer token, or null when there is no usable one. */
function subjectOf(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const payload = header.slice('Bearer '.length).split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload)) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** The role the server would resolve for this request's bearer token. */
export function roleFor(request: Request): string {
  const sub = subjectOf(request);
  return (sub && ROLE_BY_CLIENT_ID[sub]) || 'consumer';
}

export const whoamiHandlers = [
  http.get('*/v1/whoami', ({ request }) => {
    const sub = subjectOf(request);

    // The two-grant identity cannot be resolved without a choice, which is the
    // whole reason it exists. `available_tenants` sits inside the error item, not
    // at the envelope root.
    if (sub === 'knowledge-ui-multi' && !request.headers.get('x-tenant-id')) {
      return HttpResponse.json(
        makeErrorEnvelope('tenant_required', 'this identity has access to more than one tenant', {
          available_tenants: ['dev', 'dev-secondary'],
        }),
        { status: 400 },
      );
    }

    const chosenTenant = request.headers.get('x-tenant-id');
    return HttpResponse.json(
      makeWhoami({
        role: roleFor(request),
        ...(sub ? { actorDisplayName: sub } : {}),
        ...(chosenTenant ? { tenantSlug: chosenTenant } : {}),
      }),
    );
  }),
];

export const capabilityHandlers = [
  http.get('*/v1/capabilities', ({ request }) => {
    const url = new URL(request.url);
    const pageSize = Number(url.searchParams.get('page_size') ?? 20);
    const offset = decodeCursor(url.searchParams.get('cursor'));

    if (offset < 0) {
      return HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), {
        status: 400,
      });
    }

    const lifecycle = url.searchParams.get('lifecycle');
    const entityType = url.searchParams.get('entity_type');

    // A lifecycle filter narrows the set: with one applied, every row shares
    // that value by construction, which is exactly why the list needs no
    // lifecycle column.
    const total = lifecycle ? Math.min(TOTAL, 12) : TOTAL;

    const items = Array.from({ length: Math.min(pageSize, Math.max(0, total - offset)) }, (_, i) =>
      makeEntityRef({
        name: `capability-${offset + i + 1}`,
        ...(entityType ? { entity_type: entityType } : {}),
      }),
    );
    const nextOffset = offset + items.length;

    return HttpResponse.json({
      items,
      // No `total` — the real response does not carry one.
      next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    });
  }),

  http.get('*/v1/capabilities/:handle', ({ params, request }) => {
    const url = new URL(request.url);
    const detail = makeCapabilityDetail();
    // `view=audit` reveals the bitemporal fields; without it the keys are
    // absent, not null, because the server excludes unset fields.
    if (url.searchParams.get('view') === 'audit') {
      return HttpResponse.json({
        ...detail,
        t_valid_from: '2026-01-01T00:00:00Z',
        t_valid_to: null,
        t_ingested_at: '2026-01-01T00:00:00Z',
      });
    }
    return HttpResponse.json({
      ...detail,
      entity: { ...detail.entity, name: String(params.handle) },
    });
  }),
];

export const searchHandlers = [
  http.get('*/v1/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    if (q.trim() === '') {
      return HttpResponse.json(makeErrorEnvelope('validation_error', 'q is required'), {
        status: 422,
      });
    }
    const topK = Number(url.searchParams.get('top_k') ?? 10);
    const items = Array.from({ length: Math.min(topK, 5) }, (_, i) =>
      makeSearchHit({ name: `${q}-match-${i + 1}`, score: 0.9 - i * 0.1 }),
    );
    return HttpResponse.json({ items, total: items.length, took_ms: 12 });
  }),
];

export const auditHandlers = [
  http.get('*/v1/admin/audit', ({ request }) => {
    // The real endpoint requires the `auditor` role exactly, and a session
    // resolves to one role by precedence with admin above auditor — so an
    // administrator is refused here. Enforcing it in the mock is what lets the
    // page's own 403 handling be exercised, and keeps the mocked lane from
    // implying a permission the server does not grant.
    if (roleFor(request) !== 'auditor') {
      return HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 });
    }

    const url = new URL(request.url);
    const pageSize = Number(url.searchParams.get('page_size') ?? 50);
    const offset = decodeCursor(url.searchParams.get('cursor'));
    if (offset < 0) {
      // The audit endpoint reports a bad cursor as 422, unlike the list
      // endpoints' 400 — worth reproducing so the UI handles both.
      return HttpResponse.json(makeErrorEnvelope('invalid_cursor', 'cursor is not valid'), {
        status: 422,
      });
    }
    const total = 23;
    const items = Array.from({ length: Math.min(pageSize, Math.max(0, total - offset)) }, (_, i) =>
      makeAuditRow({ request_id: `req-${offset + i + 1}` }),
    );
    const nextOffset = offset + items.length;
    return HttpResponse.json({
      items,
      next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    });
  }),
];

export const opsHandlers = [
  http.get('*/healthz', () => HttpResponse.json({ status: 'ok' })),
  // Plain text with no content type, which is what the server actually sends.
  http.get('*/readyz', () => new HttpResponse('ok', { status: 200 })),
  http.get('*/metrics', () => new HttpResponse(METRICS_TEXT, { status: 200 })),
];

export const idpHandlers = [
  http.post('*/__idp/default/token', async ({ request }) => {
    // Echo the requested client_id into `sub`, because that is what the real IdP
    // does under client_credentials and it is the link the entitlement lookup
    // depends on. Hardcoding a subject here made every persona mint a consumer
    // token, so switching identity changed the label in the header and nothing
    // else.
    const form = new URLSearchParams(await request.text());
    const clientId = form.get('client_id') ?? 'knowledge-ui-consumer';

    return HttpResponse.json({
      // Header and payload are decodable but unsigned: the app only ever decodes
      // a token to read `exp`, and validation is the server's job.
      access_token: `header.${btoa(
        JSON.stringify({ sub: clientId, exp: Math.floor(Date.now() / 1000) + 3600 }),
      )}.signature`,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }),
];

export const defaultHandlers = [
  ...whoamiHandlers,
  ...capabilityHandlers,
  ...searchHandlers,
  ...auditHandlers,
  ...opsHandlers,
  ...idpHandlers,
];
