/**
 * Browsing the capability catalog: the list and one capability in full.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { components } from './generated/registry';
import { queryKeys, type KeyScope } from './keys';
import { clampPageSize, compact, toApiTimestamp } from './params';
import { LIST_OPTIONS } from './queryDefaults';

type Schemas = components['schemas'];

export type EntityRef = Schemas['EntityRefItem'];
export type CapabilityListResponse = Schemas['CapabilityListResponse'];

/**
 * The lifecycle vocabulary, in progression order.
 *
 * Closed on the server, so a value outside this set is rejected rather than
 * stored — which makes enumerating it here a mirror rather than a duplicate.
 */
export const LIFECYCLE_STATES = ['alpha', 'beta', 'ga', 'deprecated', 'retired'] as const;
export type Lifecycle = (typeof LIFECYCLE_STATES)[number];

export interface CapabilityListParams {
  cursor?: string | null;
  pageSize?: number;
  lifecycle?: Lifecycle;
  entityType?: string;
  asOf?: Date | string;
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
