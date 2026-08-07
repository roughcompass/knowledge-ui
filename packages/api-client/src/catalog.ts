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

/**
 * The capability's declared interface — its contract.
 *
 * The orientation document promises a consuming team "what its contract is", and
 * nothing in the app ever asked for it: the endpoint has existed the whole time and
 * had no client, so the one question a team asks before depending on something was
 * the one the console could not answer.
 *
 * A separate read rather than an `include` on the detail response, because it is the
 * capability's own resource and a reader who never opens the contract tab should not
 * pay for it on every page view.
 *
 * A capability with no declared interface is a normal state, not a failure — most
 * have none. The caller distinguishes an absent contract from a failed read.
 */
export function useCapabilityInterface(
  client: RegistryClient,
  scope: KeyScope,
  handle: string | undefined,
  params: { asOf?: Date | string } = {},
): UseQueryResult<Record<string, unknown>> {
  const query = compact({ as_of: params.asOf ? toApiTimestamp(params.asOf) : undefined });

  return useQuery({
    queryKey: queryKeys.capabilityInterface(scope, handle ?? '', query),
    queryFn: ({ signal }) =>
      client.request<Record<string, unknown>>(
        `/v1/capabilities/${encodeURIComponent(handle as string)}/interface`,
        { query, signal },
      ),
    enabled: Boolean(handle),
    staleTime: 60_000,
  });
}
