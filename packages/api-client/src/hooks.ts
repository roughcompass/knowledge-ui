import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { components } from './generated/registry';
import { queryKeys, type KeyScope } from './keys';
import {
  probeLiveness,
  probeReadiness,
  type Liveness,
  type Readiness,
} from './ops';
import { clampPageSize, compact, toApiTimestamp } from './params';

type Schemas = components['schemas'];

/**
 * Friendly names for the generated schemas the app actually renders.
 *
 * Re-exported here rather than imported from the generated module everywhere,
 * so a rename upstream is a change in one place.
 */
export type EntityRef = Schemas['EntityRefItem'];
export type CapabilityListResponse = Schemas['CapabilityListResponse'];
export type WhoAmI = Schemas['WhoAmIResponse'];
export type AuditRow = Schemas['AuditRow'];

/** Lifecycle vocabulary, in progression order. Not `draft`/`active`. */
export const LIFECYCLE_STATES = ['alpha', 'beta', 'ga', 'deprecated', 'retired'] as const;
export type Lifecycle = (typeof LIFECYCLE_STATES)[number];

export interface CapabilityListParams {
  cursor?: string | null;
  pageSize?: number;
  lifecycle?: Lifecycle;
  entityType?: string;
  asOf?: Date | string;
}

export interface SearchParams {
  q: string;
  topK?: number;
  entityType?: string;
  lifecycle?: Lifecycle;
}

export interface AuditParams {
  cursor?: string | null;
  pageSize?: number;
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date | string;
  to?: Date | string;
}

/** Shared defaults. Kept here so every hook behaves the same way by default. */
const LIST_OPTIONS = {
  // Keeps the previous page on screen while the next one loads, so paging does
  // not flash an empty table. v5 spells this as a placeholder rather than the
  // old keepPreviousData flag.
  placeholderData: keepPreviousData,
  staleTime: 30_000,
} as const;

export function useWhoami(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<WhoAmI> {
  return useQuery({
    queryKey: queryKeys.whoami(scope),
    queryFn: ({ signal }) => client.request<WhoAmI>('/v1/whoami', { signal }),
    enabled: options.enabled ?? true,
    // Identity does not change under a stable token, and a refetch storm here
    // would re-resolve entitlements on every mount.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCapabilities(
  client: RegistryClient,
  scope: KeyScope,
  params: CapabilityListParams,
): UseQueryResult<CapabilityListResponse> {
  const query = compact({
    cursor: params.cursor ?? undefined,
    page_size: clampPageSize('capabilities', params.pageSize),
    lifecycle: params.lifecycle,
    entity_type: params.entityType,
    as_of: params.asOf ? toApiTimestamp(params.asOf) : undefined,
  });

  return useQuery({
    queryKey: queryKeys.capabilities(scope, query),
    queryFn: ({ signal }) =>
      client.request<CapabilityListResponse>('/v1/capabilities', { query, signal }),
    ...LIST_OPTIONS,
  });
}

/**
 * One capability, by id or slug.
 *
 * `include` widens the response; `view=audit` reveals the bitemporal fields.
 * Both go into the query key, because the same handle with different includes is
 * a different payload — the server omits unset fields entirely rather than
 * returning them as null, so a cached narrow response cannot serve a wide read.
 */
export function useCapability(
  client: RegistryClient,
  scope: KeyScope,
  handle: string | undefined,
  params: { include?: string[]; asOf?: Date | string; view?: 'default' | 'audit' } = {},
): UseQueryResult<Record<string, unknown>> {
  const query = compact({
    include: params.include?.length ? params.include.join(',') : undefined,
    as_of: params.asOf ? toApiTimestamp(params.asOf) : undefined,
    view: params.view === 'audit' ? 'audit' : undefined,
  });

  return useQuery({
    queryKey: queryKeys.capability(scope, handle ?? '', query),
    queryFn: ({ signal }) =>
      client.request<Record<string, unknown>>(
        `/v1/capabilities/${encodeURIComponent(handle as string)}`,
        {
          query,
          signal,
        },
      ),
    enabled: Boolean(handle),
    staleTime: 60_000,
  });
}

export interface SearchHit {
  entity_id: string;
  tenant_id: string;
  name: string;
  entity_type: string;
  score: number;
  retrieval_arms?: { semantic?: number; lexical?: number; graph?: number };
  matching_facts?: unknown[];
}

export interface SearchResponse {
  items: SearchHit[];
  total: number;
  took_ms: number;
}

export function useSearch(
  client: RegistryClient,
  scope: KeyScope,
  params: SearchParams,
  options: { enabled?: boolean } = {},
): UseQueryResult<SearchResponse> {
  const query = compact({
    q: params.q,
    top_k: clampPageSize('search', params.topK),
    entity_type: params.entityType,
    lifecycle: params.lifecycle,
  });

  return useQuery({
    queryKey: queryKeys.search(scope, query),
    queryFn: ({ signal }) => client.request<SearchResponse>('/v1/search', { query, signal }),
    // An empty query is a 422 from the server, so the hook stays idle until
    // there is something to search for.
    enabled: (options.enabled ?? true) && params.q.trim().length > 0,
    ...LIST_OPTIONS,
  });
}

export interface AuditResponse {
  items: AuditRow[];
  next_cursor: string | null;
}

export function useAuditLog(
  client: RegistryClient,
  scope: KeyScope,
  params: AuditParams,
  options: { enabled?: boolean } = {},
): UseQueryResult<AuditResponse> {
  const query = compact({
    cursor: params.cursor ?? undefined,
    page_size: clampPageSize('audit', params.pageSize),
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    // `from`/`to` are the query aliases; the server's own field names differ.
    from: params.from ? toApiTimestamp(params.from) : undefined,
    to: params.to ? toApiTimestamp(params.to) : undefined,
  });

  return useQuery({
    queryKey: queryKeys.audit(scope, query),
    queryFn: ({ signal }) => client.request<AuditResponse>('/v1/admin/audit', { query, signal }),
    enabled: options.enabled ?? true,
    // A 403 here means the role is wrong, which retrying cannot fix.
    retry: false,
    ...LIST_OPTIONS,
  });
}

export function useLiveness(scope: KeyScope, baseUrl = ''): UseQueryResult<Liveness> {
  return useQuery({
    queryKey: queryKeys.liveness(scope),
    queryFn: ({ signal }) => probeLiveness({ baseUrl, signal }),
    refetchInterval: 10_000,
    // The probe resolves rather than throws for an unreachable server, so a
    // retry would only delay showing the reader that it is down.
    retry: false,
  });
}

export function useReadiness(scope: KeyScope, baseUrl = ''): UseQueryResult<Readiness> {
  return useQuery({
    queryKey: queryKeys.readiness(scope),
    queryFn: ({ signal }) => probeReadiness({ baseUrl, signal }),
    refetchInterval: 10_000,
    retry: false,
  });
}

/**
 * One operational reading, with everything needed to read it correctly.
 *
 * `scope` and `kind` are required rather than optional, mirroring the server's
 * response model. They are the difference between a number that is true for the
 * deployment and one that is a single replica's tally since it last restarted,
 * and the two are indistinguishable once rendered.
 */
export interface OperationalReading {
  key: string;
  label: string;
  /** Null when the value could not be read. Deliberately not zero. */
  value: number | null;
  /** `cluster` is counted from the database; `process` is this replica's counter. */
  scope: 'cluster' | 'process';
  /** `gauge` is current state; `counter` is cumulative since process start. */
  kind: 'gauge' | 'counter';
  /** Which replica answered. Set only for process-scoped readings. */
  instance: string | null;
  /** Why a non-zero value matters. Present when it is actionable on sight. */
  actionable: string | null;
}

export interface OperationalHealth {
  observed_at: string;
  queues: OperationalReading[];
  data_quality: OperationalReading[];
}

export function useOperationalHealth(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<OperationalHealth> {
  return useQuery({
    queryKey: queryKeys.operationalHealth(scope),
    queryFn: ({ signal }) =>
      client.request<OperationalHealth>('/v1/admin/operational-health', { signal }),
    enabled: options.enabled ?? true,
    refetchInterval: 15_000,
    // Queue depths are current state, so a cached reading is misleading in a
    // way a cached list is not: it reports a backlog that has since moved.
    staleTime: 0,
    retry: 1,
  });
}
