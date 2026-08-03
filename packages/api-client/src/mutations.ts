import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { SyncSource, SyncSourceCreate, SyncSourcePatch, TriggerReceipt } from './admin';
import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import { queryKeys, type KeyScope } from './keys';
import { IDEMPOTENCY_HEADER, compact, newIdempotencyKey } from './params';

/**
 * The write path.
 *
 * Separate from `hooks.ts` and `admin.ts`, which are reads. Everything in this file
 * follows four conventions; they are written here once rather than repeated at each
 * hook, and they are the actual deliverable of this module — the sync-source
 * mutations are just the first three callers.
 *
 * ## 1. The error type is named
 *
 * Every hook declares `UseMutationResult<TData, RegistryError, TVars>`. Without the
 * explicit second parameter React Query defaults to `Error`, and `error.items` —
 * the per-field detail a form needs — is then unreachable without a cast at every
 * call site. Naming it once here is what makes `fieldErrors(mutation.error)` type-check.
 *
 * ## 2. The idempotency key is minted inside `mutationFn`
 *
 * Not in `client.ts`: that layer deliberately knows nothing about which endpoints
 * declare the header, and adding it to every POST would key requests that do not
 * accept one. Not at the call site either — a caller who forgets gets an *inert*
 * context server-side, so protection is lost with no error anywhere.
 *
 * This is only correct because `mutations: { retry: 0 }` is set on the app's
 * QueryClient. With retries enabled, `mutationFn` re-runs on failure and would mint
 * a *fresh* key each time, which is precisely the thing idempotency exists to
 * prevent. If that default ever changes, the key has to move out to `onMutate`.
 *
 * ## 3. Invalidation is by prefix, never `setQueryData`
 *
 * Each hook invalidates the narrowest prefix that can have changed. `queryKeys`
 * puts every admin read under a shared `'admin'` segment, so
 * `queryKeys.adminRoot(scope)` is available as a bounded blunt instrument — it
 * cannot reach catalog, search or ops.
 *
 * ## 4. No optimistic updates
 *
 * Considered and declined, for reasons specific to these three endpoints rather
 * than as a general policy:
 *
 *   - `trigger` returns 202 and the run row is written later by a background
 *     scheduler job. The `sync_run_id` in its response is minted for the receipt
 *     and matches no row. An optimistic row would therefore appear and then vanish
 *     when the invalidated refetch returns without it.
 *   - `create` returns a server-generated `source_id`, `created_at`, `created_by`
 *     and a `config` the connector may have normalised. None of those can be
 *     guessed.
 *   - `patch` is the only defensible case, and it is the one with a 412 failure
 *     mode once `If-Match` is threaded through — so it wants the rollback path
 *     that does not exist yet.
 *
 * Establishing `onMutate`/rollback on a slice where nothing needs it is how a
 * codebase acquires a convention nobody understands.
 */

export function useTriggerSync(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<TriggerReceipt, RegistryError, { sourceId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId }) =>
      client.request<TriggerReceipt>(
        `/v1/admin/sync-sources/${encodeURIComponent(sourceId)}/trigger`,
        {
          method: 'POST',
          headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
        },
      ),
    onSuccess: () => {
      /*
       * Runs only. The source itself is untouched by a trigger, and the run this
       * queued does not exist yet — the refetch is what will eventually show it.
       */
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncRuns(scope) });
    },
  });
}

export function useCreateSyncSource(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<SyncSource, RegistryError, SyncSourceCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body) =>
      client.request<SyncSource>('/v1/admin/sync-sources', {
        method: 'POST',
        // `compact` so an untouched optional field is absent rather than `''`,
        // which the server would treat as a value.
        body: compact(body as unknown as Record<string, unknown>),
        headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
        /*
         * The one call that legitimately outlives the client's default deadline.
         * `admin_sync.py` runs `connector.validate()` inside this request, so its
         * latency includes an outbound round trip to whatever `credentials_ref`
         * points at. Raising the default instead would make every read wait ten
         * extra seconds before reporting a stall.
         */
        timeoutMs: 30_000,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncSources(scope) });
    },
  });
}

/**
 * Edit a source, and deactivate one.
 *
 * `is_active: false` is the deactivate path — there is no separate endpoint, and the
 * `DELETE` is *also* a soft deactivate rather than a removal. One mutation covers
 * both, which is why the variables carry the whole patch rather than a boolean.
 */
export function usePatchSyncSource(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<SyncSource, RegistryError, { sourceId: string; patch: SyncSourcePatch }> {
  const queryClient = useQueryClient();

  return useMutation({
    // No idempotency key: PATCH declares no such header, and a repeated PATCH with
    // the same body is already idempotent by construction.
    mutationFn: ({ sourceId, patch }) =>
      client.request<SyncSource>(`/v1/admin/sync-sources/${encodeURIComponent(sourceId)}`, {
        method: 'PATCH',
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: (_data, { sourceId }) => {
      // Both the list and this row's detail. Two calls rather than one broader
      // prefix, so a trigger receipt on another row is not thrown away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncSources(scope) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncSource(scope, sourceId) });
    },
  });
}
