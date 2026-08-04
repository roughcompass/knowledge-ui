import { HttpResponse, http } from 'msw';

import { adminSyncHandlers } from './adminSync';
import { consumerHandlers } from './consumer';
import { roleFor, subjectOf } from './role';
import { impactHandlers, memoryHandlers } from './memoryAndImpact';

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
    // `view=audit` adds the audit-only fields; without it the keys are absent,
    // not null, because the server excludes unset fields.
    //
    // These are the fields the server actually adds at the entity level. This
    // fixture used to return storage-prefixed bitemporal columns instead —
    // names the capability response has never carried under any view — which is
    // why the page's audit panel could read as working while rendering nothing
    // against a real registry. Bitemporal intervals belong to facts and edges,
    // and appear on those.
    if (url.searchParams.get('view') === 'audit') {
      return HttpResponse.json({
        ...detail,
        tenant_id: 'tenant-0000-0000-0000-000000000001',
        is_active: true,
        superseded_facts_count: 0,
        as_of: '2026-01-01T00:00:00Z',
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

  /**
   * The operator health summary.
   *
   * Admin-gated to mirror `require_roles([ROLE_ADMIN])`, so a page rendered as
   * any other persona meets the same 403 it would in production rather than a
   * cheerful mock. Every reading carries `scope` and `kind` because the server's
   * response model requires them — a fixture that omitted them would let a page
   * ship that renders bare numbers and passes its tests.
   */
  http.get('*/v1/admin/operational-health', ({ request }) => {
    if (roleFor(request) !== 'admin') {
      return HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 });
    }
    return HttpResponse.json({
      observed_at: '2026-08-03T18:00:00Z',
      queues: [
        reading('embedding_outbox', 'Embedding outbox', 12, 'cluster', 'gauge'),
        reading('closure_outbox', 'Closure refresh backlog', 0, 'cluster', 'gauge'),
        reading('webhook_pending', 'Webhook deliveries pending', 3, 'cluster', 'gauge'),
        {
          ...reading('webhook_failed', 'Webhook deliveries abandoned', 2, 'cluster', 'gauge'),
          actionable:
            'These deliveries exhausted their retries and will never arrive. A subscriber is missing change notifications and has no way to know.',
        },
      ],
      data_quality: [
        {
          ...reading(
            'entitlement_dropped_entries',
            'Dropped entitlement entries',
            1,
            'process',
            'counter',
          ),
          instance: 'registry-7d9f',
          actionable:
            'An entitlement arrived in a shape the parser rejected, so a principal silently resolved to fewer roles than it was granted.',
        },
        {
          ...reading(
            'entitlement_parse_ignored',
            'Entitlement entries ignored during parse',
            0,
            'process',
            'counter',
          ),
          instance: 'registry-7d9f',
          actionable:
            'Part of an entitlement string was unreadable and was skipped rather than failing the request.',
        },
        {
          ...reading(
            'authority_parse_failures',
            'Authority parse failures',
            0,
            'process',
            'counter',
          ),
          instance: 'registry-7d9f',
          actionable:
            'A token authority could not be parsed, which usually means an issuer is misconfigured.',
        },
        {
          ...reading('audit_write_failures', 'Audit write failures', 0, 'process', 'counter'),
          instance: 'registry-7d9f',
          actionable:
            'An audit row was lost. The compliance record has a hole in it, and the request that caused it still succeeded.',
        },
      ],
    });
  }),
];

function reading(
  key: string,
  label: string,
  value: number | null,
  scope: 'cluster' | 'process',
  kind: 'gauge' | 'counter',
) {
  return { key, label, value, scope, kind, instance: null, actionable: null };
}

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

/*
 * `adminSyncHandlers` is imported lazily-ish — at the bottom, after `roleFor` is
 * defined — because that group needs the role resolver and putting it in its own
 * module keeps this one from growing a stateful store.
 */
/** Re-exported so existing importers of `./handlers` keep working. */
export { roleFor } from './role';

export const defaultHandlers = [
  ...memoryHandlers,
  ...impactHandlers,
  ...whoamiHandlers,
  ...capabilityHandlers,
  ...searchHandlers,
  ...auditHandlers,
  ...adminSyncHandlers,
  ...consumerHandlers,
  ...opsHandlers,
  ...idpHandlers,
];
