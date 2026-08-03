/**
 * The consumer side: adoption, subscriptions, and the notifications inbox.
 *
 * Three surfaces that look related and are deliberately not coupled. Adopting a
 * capability records that you depend on it; subscribing says which changes you
 * want to hear about; the inbox is where those changes arrive. A team may watch
 * something it has not adopted, and adopting does not silently subscribe --
 * coupling them here would be a policy this client invented rather than one the
 * server expresses.
 *
 * ## What the API does and does not offer
 *
 * `GET /v1/capabilities/{id}/adoptions` returns **the calling tenant's own
 * adoption** for that one capability, not a roster of adopters. So adoption
 * state is a per-capability read, and there is no cross-capability "my
 * adoptions" list: `/v1/graph/consumer` returns only `nodes` and `edges`, with
 * no version pin and no behind-status. Deriving that client-side would mean
 * asserting state the server never did, so the surface is absent rather than
 * approximated.
 *
 * Notifications carry no read flag. Read state exists only as the list's
 * `status` filter, which defaults to `unread` -- so marking one read is a call
 * plus an invalidation, never a local edit to a cached row.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { components } from './generated/registry';
import { queryKeys, type KeyScope } from './keys';
import { IDEMPOTENCY_HEADER, clampPageSize, compact, newIdempotencyKey } from './params';

type Schemas = components['schemas'];

export type Adoption = Schemas['AdoptionResponse'];
export type AdoptionListResponse = Schemas['AdoptionListResponse'];
export type Subscription = Schemas['SubscriptionResponse'];
export type NotificationItem = Schemas['NotificationItem'];
export type NotificationListResponse = Schemas['NotificationListResponse'];

/**
 * The subscribable event kinds.
 *
 * Enumerated here because the server's own vocabulary is closed and a typo in a
 * subscription's `event_kinds` is accepted syntactically and then silently
 * matches nothing -- a subscription that exists and never fires is worse than
 * one that was refused.
 */
export const EVENT_KINDS = [
  'version_published',
  'breaking_change',
  'lifecycle_changed',
  'deprecated',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Read state is a filter on the list, not a field on the row. */
export const NOTIFICATION_STATUSES = ['unread', 'read', 'all'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

// -- adoption ---------------------------------------------------------------

/**
 * This tenant's adoption of one capability, or none.
 *
 * Returns the first item rather than the list because the endpoint is scoped to
 * the caller's own tenant: more than one active adoption of the same capability
 * by the same tenant is not a state the server produces, and a UI that rendered
 * a list here would be preparing for a case that cannot arrive.
 */
export function useAdoption(
  client: RegistryClient,
  scope: KeyScope,
  capabilityHandle: string | undefined,
): UseQueryResult<Adoption | null, RegistryError> {
  return useQuery({
    queryKey: queryKeys.adoption(scope, capabilityHandle ?? ''),
    enabled: Boolean(capabilityHandle),
    queryFn: async () => {
      const res = await client.request<AdoptionListResponse>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle as string)}/adoptions`,
      );
      return res.items.at(0) ?? null;
    },
  });
}

export interface AdoptInput {
  capabilityHandle: string;
  versionPin?: string | null;
  intent?: string | null;
}

export function useAdopt(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Adoption, RegistryError, AdoptInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ capabilityHandle, versionPin, intent }) =>
      client.request<Adoption>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle)}/adoptions`,
        {
          method: 'POST',
          body: compact({ version_pin: versionPin, intent }),
          headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
        },
      ),
    onSuccess: (_data, { capabilityHandle }) => {
      /*
       * Invalidate rather than seed the cache with the response. The detail page
       * must render adoption state from a server read, so that a POST which
       * succeeded and was then reversed elsewhere cannot leave the button
       * claiming a state that no longer holds.
       */
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adoption(scope, capabilityHandle),
      });
    },
  });
}

export function useUnadopt(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { capabilityHandle: string; adoptionId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ capabilityHandle, adoptionId }) => {
      await client.request<void>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle)}/adoptions/${encodeURIComponent(adoptionId)}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: (_data, { capabilityHandle }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adoption(scope, capabilityHandle),
      });
    },
  });
}

// -- subscriptions ----------------------------------------------------------

export function useSubscriptions(
  client: RegistryClient,
  scope: KeyScope,
  capabilityHandle: string | undefined,
): UseQueryResult<Subscription[], RegistryError> {
  return useQuery({
    queryKey: queryKeys.subscriptions(scope, capabilityHandle ?? ''),
    enabled: Boolean(capabilityHandle),
    queryFn: async () => {
      const res = await client.request<{ items: Subscription[] }>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle as string)}/subscriptions`,
      );
      return res.items;
    },
  });
}

export interface SubscriptionCreate {
  capabilityHandle: string;
  event_kinds: EventKind[];
  webhook_url?: string | null;
  digest_window?: string | null;
}

export function useCreateSubscription(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Subscription, RegistryError, SubscriptionCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ capabilityHandle, ...body }) =>
      client.request<Subscription>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle)}/subscriptions`,
        {
          method: 'POST',
          body: compact(body as unknown as Record<string, unknown>),
          headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
        },
      ),
    onSuccess: (_data, { capabilityHandle }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions(scope, capabilityHandle),
      });
    },
  });
}

export interface SubscriptionPatch {
  subscriptionId: string;
  capabilityHandle: string;
  patch: { event_kinds?: EventKind[]; is_enabled?: boolean; webhook_url?: string | null };
}

export function usePatchSubscription(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Subscription, RegistryError, SubscriptionPatch> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ subscriptionId, patch }) =>
      client.request<Subscription>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: 'PATCH',
        body: compact(patch as unknown as Record<string, unknown>),
        headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
      }),
    onSuccess: (_data, { capabilityHandle }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions(scope, capabilityHandle),
      });
    },
  });
}

export function useDeleteSubscription(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { subscriptionId: string; capabilityHandle: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subscriptionId }) => {
      await client.request<void>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data, { capabilityHandle }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions(scope, capabilityHandle),
      });
    },
  });
}

// -- notifications ----------------------------------------------------------

export interface NotificationParams {
  status?: NotificationStatus;
  cursor?: string | null;
  pageSize?: number;
}

export function useNotifications(
  client: RegistryClient,
  scope: KeyScope,
  params: NotificationParams = {},
): UseQueryResult<NotificationListResponse, RegistryError> {
  const query = compact({
    status: params.status ?? 'unread',
    cursor: params.cursor,
    page_size: clampPageSize('notifications', params.pageSize),
  });

  return useQuery({
    queryKey: queryKeys.notifications(scope, query),
    queryFn: () => client.request<NotificationListResponse>('/v1/notifications', { query }),
  });
}

/**
 * Mark one notification read.
 *
 * There is no bulk endpoint, and the item carries no read flag, so this is a
 * call followed by an invalidation of every notification list. Removing the row
 * locally would desynchronise from a server that may have marked it read
 * through another surface.
 */
export function useMarkNotificationRead(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { notificationId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId }) => {
      await client.request<void>(
        `/v1/notifications/${encodeURIComponent(notificationId)}:mark-read`,
        { method: 'POST', headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() } },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsRoot(scope) });
    },
  });
}
