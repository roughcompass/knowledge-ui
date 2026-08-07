import { HttpResponse, http } from 'msw';

/**
 * Handlers for the consumer surfaces, with a store rather than fixed responses.
 *
 * Adoption is stateful on purpose. The behaviour worth testing is that the UI
 * reads state back from the server instead of trusting its own last mutation, and
 * a handler that always answers "adopted" or always "not adopted" cannot
 * distinguish a component that re-reads from one that guessed correctly.
 *
 * Notifications are stateful for the same reason: mark-read has to actually
 * remove the row from the `status=unread` view, which is the only place read
 * state exists — the item itself carries no read flag.
 */

interface AdoptionRow {
  adoption_id: string;
  provider_capability_id: string;
  consumer_tenant_id: string;
  tenant_id: string;
  actor_id: string | null;
  version_pin: string | null;
  intent: string | null;
}

interface NotificationRow {
  notification_id: string;
  tenant_id: string;
  capability_id: string;
  capability_slug: string;
  event_kind: string;
  change_classification: string | null;
  version_before: string | null;
  version_after: string | null;
  occurred_at: string;
  fetch_url: string;
  subscription_id: string | null;
  read: boolean;
}

const adoptions = new Map<string, AdoptionRow>();
const subscriptions = new Map<string, Record<string, unknown>>();
let notifications: NotificationRow[] = [];
let seq = 0;

export function resetConsumerStore(): void {
  adoptions.clear();
  subscriptions.clear();
  seq = 0;
  notifications = [
    {
      notification_id: 'n-1',
      tenant_id: 't-1',
      capability_id: 'c-1',
      capability_slug: 'salt-design-system',
      event_kind: 'version_published',
      change_classification: 'minor',
      version_before: '3.1.0',
      version_after: '3.2.0',
      occurred_at: '2026-08-01T10:00:00Z',
      fetch_url: '/v1/capabilities/salt-design-system',
      subscription_id: 's-1',
      read: false,
    },
    {
      notification_id: 'n-2',
      tenant_id: 't-1',
      capability_id: 'c-2',
      capability_slug: 'payments-api',
      event_kind: 'breaking_change',
      change_classification: 'major',
      version_before: '2.0.0',
      version_after: '3.0.0',
      occurred_at: '2026-08-02T09:00:00Z',
      fetch_url: '/v1/capabilities/payments-api',
      subscription_id: 's-2',
      read: false,
    },
  ];
}

resetConsumerStore();

/** Seed an adoption so a test can start from the adopted state. */
export function seedAdoption(handle: string, versionPin: string | null = null): AdoptionRow {
  const row: AdoptionRow = {
    adoption_id: `a-${++seq}`,
    provider_capability_id: handle,
    consumer_tenant_id: 't-1',
    tenant_id: 't-1',
    actor_id: 'actor-1',
    version_pin: versionPin,
    intent: null,
  };
  adoptions.set(handle, row);
  return row;
}

export const consumerHandlers = [
  http.get('*/v1/capabilities/:handle/adoptions', ({ params }) => {
    const row = adoptions.get(String(params.handle));
    // The endpoint returns the CALLING TENANT'S own adoption, so at most one.
    return HttpResponse.json({ items: row ? [row] : [], next_cursor: null });
  }),

  http.post('*/v1/capabilities/:handle/adoptions', async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const handle = String(params.handle);
    const row = seedAdoption(handle, (body.version_pin as string | null) ?? null);
    row.intent = (body.intent as string | null) ?? null;
    return HttpResponse.json(row, { status: 201 });
  }),

  http.delete('*/v1/capabilities/:handle/adoptions/:adoptionId', ({ params }) => {
    adoptions.delete(String(params.handle));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/v1/capabilities/:handle/subscriptions', ({ params }) => {
    const items = [...subscriptions.values()].filter(
      (s) => s.capability_id === String(params.handle),
    );
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.post('*/v1/capabilities/:handle/subscriptions', async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = `s-${++seq}`;
    const row = {
      subscription_id: id,
      capability_id: String(params.handle),
      tenant_id: 't-1',
      actor_id: 'actor-1',
      event_kinds: body.event_kinds ?? [],
      digest_window: body.digest_window ?? 'immediate',
      webhook_url: body.webhook_url ?? null,
      webhook_hmac_secret_ref: null,
      is_enabled: true,
    };
    subscriptions.set(id, row);
    return HttpResponse.json(row, { status: 201 });
  }),

  http.patch('*/v1/subscriptions/:id', async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const existing = subscriptions.get(String(params.id)) ?? {};
    const row = { ...existing, ...body, subscription_id: String(params.id) };
    subscriptions.set(String(params.id), row);
    return HttpResponse.json(row);
  }),

  http.delete('*/v1/subscriptions/:id', ({ params }) => {
    subscriptions.delete(String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/v1/notifications', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status') ?? 'unread';
    const items = notifications.filter((n) =>
      status === 'all' ? true : status === 'read' ? n.read : !n.read,
    );
    // `read` is an implementation detail of this store, not part of the wire
    // shape — the real item carries no read flag, so it must not leak here or a
    // component could start depending on something the API never sends.
    return HttpResponse.json({
      items: items.map(({ read: _read, ...rest }) => rest),
      next_cursor: null,
    });
  }),

  http.post('*/v1/notifications/:id\\:mark-read', ({ params }) => {
    const row = notifications.find((n) => n.notification_id === String(params.id));
    if (row) row.read = true;
    return new HttpResponse(null, { status: 204 });
  }),
];
