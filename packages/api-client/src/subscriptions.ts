/**
 * Subscriptions: choosing which changes to a capability you hear about.
 *
 * Separate from adoption on purpose. A team may watch something it has not
 * adopted, so subscribing does not require adopting — coupling the two here
 * would be a policy this client invented rather than one the server expresses.
 * The reverse coupling *does* exist and belongs to the server: see the adoption
 * module for the auto-created subscription that outlives an unadopt.
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
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';
import { IDEMPOTENCY_HEADER, compact, newIdempotencyKey } from './params';

type Schemas = components['schemas'];

export type Subscription = Schemas['SubscriptionResponse'];

/**
 * The subscribable event kinds.
 *
 * Enumerated here because the server's own vocabulary is closed and a typo in a
 * subscription's `event_kinds` is accepted syntactically and then silently
 * matches nothing — a subscription that exists and never fires is worse than one
 * that was refused.
 */
export const EVENT_KINDS = [
  'version_published',
  'breaking_change',
  'lifecycle_changed',
  'deprecated',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

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
