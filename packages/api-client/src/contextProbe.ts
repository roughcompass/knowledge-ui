/**
 * Immutable retrieval probes for the Context Lab.
 *
 * A probe asks exactly one source. The catalog, Living Memory and workspaces
 * answer different questions and carry different trust envelopes, so a client
 * fan-out would create a comparison the service never claimed was valid.
 *
 * This is a mutation rather than a cached query on purpose. A lab turn is an
 * evaluation snapshot: once it is in the transcript, a focus change must not
 * silently refetch it and replace the evidence the evaluator marked.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { Claim, ClaimPersona } from './memory';
import { compact } from './params';
import type { SearchHit } from './search';
import type { WorkspaceEntry } from './workspaces';

export const CONTEXT_PROBE_SOURCES = ['catalog', 'claims', 'workspaces'] as const;
export type ContextProbeSource = (typeof CONTEXT_PROBE_SOURCES)[number];

export interface ContextProbeRequest {
  source: ContextProbeSource;
  query: string;
  /** Used only by the claims source, whose endpoint exposes this retrieval choice. */
  claimPersona?: ClaimPersona;
}

export interface CatalogProbeResult {
  source: 'catalog';
  items: SearchHit[];
  /** Served by `/v1/search`; this is not the number of visible catalog entities. */
  total: number;
  took_ms: number;
}

export interface ClaimProbeResult {
  source: 'claims';
  items: Claim[];
}

export interface WorkspaceProbeResult {
  source: 'workspaces';
  items: WorkspaceEntry[];
  next_cursor: string | null;
  /** Advisory and absent when the service declines to count. */
  total_count?: number | null;
}

export type ContextProbeResult = CatalogProbeResult | ClaimProbeResult | WorkspaceProbeResult;

export function contextProbeItemId(item: SearchHit | Claim | WorkspaceEntry): string {
  if ('entity_id' in item) return item.entity_id;
  if ('claim_id' in item) return item.claim_id;
  return item.entry_id;
}

/** Run one source-specific retrieval without placing the response in a live cache. */
export async function runContextProbe(
  client: RegistryClient,
  request: ContextProbeRequest,
): Promise<ContextProbeResult> {
  const query = request.query.trim();
  if (query.length === 0) throw new TypeError('a context probe requires a query');

  if (request.source === 'catalog') {
    const response = await client.request<{
      items: SearchHit[];
      total: number;
      took_ms: number;
    }>('/v1/search', { query: { q: query, top_k: 10 } });
    return { source: 'catalog', ...response };
  }

  if (request.source === 'claims') {
    const items = await client.request<Claim[]>('/v1/memory/claims/search', {
      query: compact({ q: query, persona: request.claimPersona, top_k: 10 }),
    });
    return { source: 'claims', items };
  }

  const response = await client.request<{
    items: WorkspaceEntry[];
    next_cursor: string | null;
    total_count?: number | null;
  }>('/v1/workspaces/search', { query: { q: query } });
  return { source: 'workspaces', ...response };
}

export function useContextProbe(
  client: RegistryClient,
): UseMutationResult<ContextProbeResult, RegistryError | TypeError, ContextProbeRequest> {
  return useMutation({ mutationFn: (request) => runContextProbe(client, request) });
}
