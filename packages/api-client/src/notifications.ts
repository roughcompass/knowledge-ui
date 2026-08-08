/**
 * The notifications inbox: where subscribed changes arrive.
 *
 * **Notifications carry no read flag.** Read state exists only as the list's
 * `status` filter, which defaults to `unread` — so marking one read is a call
 * plus an invalidation of a *root* key, never a local edit to a cached row.
 * Editing the row instead would desynchronise from a server that may have
 * changed it by another route, and would leave every other filtered view of the
 * same data stale.
 *
 * Payloads are deliberately minimal server-side — event kind, change
 * classification, versions before and after, when it happened, and a URL to
 * fetch. So the inbox links out to the capability rather than pretending to
 * summarise the change inline; rendering a payload the API minimises on purpose
 * invites the reader to trust a summary that was never meant to be one.
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
import { IDEMPOTENCY_HEADER, clampPageSize, compact, newIdempotencyKey } from './params';

type Schemas = components['schemas'];

export type NotificationItem = Schemas['NotificationItem'];
export type NotificationListResponse = Schemas['NotificationListResponse'];

/** Read state is a filter on the list, not a field on the row. */
export const NOTIFICATION_STATUSES = ['unread', 'read', 'all'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

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
/**
 * Mark several notifications read, one call each.
 *
 * There is no bulk endpoint, so this is a fan-out and it does not pretend
 * otherwise. Two consequences the caller has to surface rather than hide:
 *
 * It is **not atomic**. A failure partway through leaves the earlier items read
 * and the later ones unread, which is a legitimate outcome — the ones that
 * succeeded really are read — but it is not the outcome "mark all read" implies.
 * So the result reports both halves rather than throwing on the first error.
 *
 * Concurrency is bounded. Firing an unbounded fan-out at a rate-limited API is
 * how a convenience turns into a 429 storm that leaves *more* work undone than
 * doing nothing would have.
 */
export function useMarkAllNotificationsRead(
  client: RegistryClient,
  scope: KeyScope,
  { concurrency = 4 }: { concurrency?: number } = {},
): UseMutationResult<
  { succeeded: string[]; failed: Array<{ id: string; error: unknown }> },
  RegistryError,
  { notificationIds: string[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationIds }) => {
      const succeeded: string[] = [];
      const failed: Array<{ id: string; error: unknown }> = [];
      const queue = [...notificationIds];

      const worker = async (): Promise<void> => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          try {
            await client.request<void>(`/v1/notifications/${encodeURIComponent(id)}:mark-read`, {
              method: 'POST',
              headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
            });
            succeeded.push(id);
          } catch (error) {
            // Collected, not rethrown. One failure must not abandon the rest:
            // the caller asked for all of them, and the ones that can succeed
            // should.
            failed.push({ id, error });
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
      return { succeeded, failed };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsRoot(scope) });
    },
  });
}

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
