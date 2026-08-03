import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { components } from './generated/registry';
import { queryKeys, type KeyScope } from './keys';
import { compact, toApiTimestamp } from './params';

/**
 * The operator surfaces: `/v1/admin/*`, minus audit.
 *
 * A separate module from `hooks.ts` because the admin family differs from the
 * catalog reads in a way that matters at the type level: **every one of these
 * endpoints returns a bare JSON array**, not the `{items, next_cursor}` envelope
 * the catalog uses. There is no cursor and no `page_size` on any of them — verified
 * against the spec and against `admin_sync.py`, whose `list_sync_runs` is a plain
 * `select(...).order_by(started_at.desc())` with no LIMIT.
 *
 * Three consequences, all of which read as omissions unless stated:
 *
 *   - no `PAGE_LIMITS` entry and no `clampPageSize` call — there is no page size
 *     to clamp;
 *   - no `CursorStack`, `filterSignature` or `CursorPager` in the pages above these;
 *   - the runs list is **unbounded**, so a caller should pass `from` rather than
 *     rely on the server to cap anything.
 *
 * Every endpoint here is `require_roles([ROLE_ADMIN])`. The hooks do not check that
 * — `RequireCapability` gates the route — but they take `enabled` so a page can
 * decline to ask when the role changed underneath it, which is the same reason
 * `useAuditLog` has one.
 */

type Schemas = components['schemas'];

export type SyncSource = Schemas['SyncSourceResponse'];
export type SyncRun = Schemas['SyncRunResponse'];
export type SupersededFact = Schemas['SupersededFactResponse'];
export type TriggerReceipt = Schemas['TriggerResponse'];
export type SyncSourceCreate = Schemas['SyncSourceCreate'];
export type SyncSourcePatch = Schemas['SyncSourcePatch'];

/**
 * The connector types the server will accept for `source_type`.
 *
 * Hardcoded because the registry publishes no endpoint listing them: they are the
 * keys of the `CONNECTORS` dict in `registry/sync/registry.py`, and a POST with an
 * unknown value is refused with a 422 whose `path` is `null`. Sending one of these
 * is the only way to find out it is wrong at build time rather than at submit time.
 */
export const SYNC_SOURCE_TYPES = [
  'openapi',
  'release_notes',
  'markdown_adr_rfc',
  'package_json',
  'docs_corpus',
] as const;
export type SyncSourceType = (typeof SYNC_SOURCE_TYPES)[number];

/**
 * The statuses a run can report.
 *
 * Also hardcoded, and also not published: `queued` is what `trigger` returns, the
 * rest are written by `sync/runner.py`. Used for the filter control, so an unknown
 * value arriving from the server still renders — it just is not offered as a filter.
 */
export const SYNC_RUN_STATUSES = ['queued', 'running', 'done', 'partial', 'failed'] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

const LIST_OPTIONS = {
  placeholderData: keepPreviousData,
  staleTime: 30_000,
} as const;

export function useSyncSources(
  client: RegistryClient,
  scope: KeyScope,
  params: { activeOnly?: boolean } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<SyncSource[]> {
  const query = compact({ active_only: params.activeOnly });

  return useQuery({
    queryKey: queryKeys.syncSources(scope, query),
    queryFn: ({ signal }) => client.request<SyncSource[]>('/v1/admin/sync-sources', { query, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

export function useSyncSource(
  client: RegistryClient,
  scope: KeyScope,
  sourceId: string | undefined,
): UseQueryResult<SyncSource> {
  return useQuery({
    queryKey: queryKeys.syncSource(scope, sourceId ?? ''),
    queryFn: ({ signal }) =>
      client.request<SyncSource>(`/v1/admin/sync-sources/${encodeURIComponent(sourceId as string)}`, {
        signal,
      }),
    enabled: Boolean(sourceId),
    staleTime: 30_000,
  });
}

export interface SyncRunParams {
  sourceId?: string;
  status?: string;
  /** Lower bound on `started_at`. Worth always passing — the list is unbounded. */
  from?: Date | string;
  to?: Date | string;
}

export function useSyncRuns(
  client: RegistryClient,
  scope: KeyScope,
  params: SyncRunParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<SyncRun[]> {
  const query = compact({
    source_id: params.sourceId,
    status: params.status,
    // `from`/`to` are the wire names, and the server wants the `Z` suffix that
    // `toApiTimestamp` forces.
    from: params.from ? toApiTimestamp(params.from) : undefined,
    to: params.to ? toApiTimestamp(params.to) : undefined,
  });

  return useQuery({
    queryKey: queryKeys.syncRuns(scope, query),
    queryFn: ({ signal }) => client.request<SyncRun[]>('/v1/admin/sync-runs', { query, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}
