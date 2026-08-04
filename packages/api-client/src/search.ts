/**
 * Hybrid search across the catalog, with citations.
 *
 * Every hit carries the sources it was drawn from, because an answer a reader
 * cannot verify is not usable as a fact — the point of returning citations is
 * that they can be followed.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { Lifecycle } from './catalog';
import { queryKeys, type KeyScope } from './keys';
import { clampPageSize, compact } from './params';
import { LIST_OPTIONS } from './queryDefaults';

export interface SearchParams {
  q: string;
  topK?: number;
  entityType?: string;
  lifecycle?: Lifecycle;
}

/** A resolvable handle to one artifact that made a result match. */
export interface SearchCitation {
  fact_id: string;
  category?: string | null;
  title?: string | null;
  created_at?: string | null;
  _links?: { self?: string };
}

export interface SearchHit {
  entity_id: string;
  name: string;
  entity_type: string;
  score: number;
  retrieval_arms?: { semantic?: number; lexical?: number; graph?: number };
  /** Always present: a result names the evidence that made it match. */
  citations: SearchCitation[];
  /** Audit view only. Follow a citation's `_links.self` to read a body. */
  tenant_id?: string;
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
