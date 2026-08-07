import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { queryKeys, type KeyScope } from './keys';
import type { RegistryClient } from './client';

/**
 * The curation queue — everything in this tenant needing a curator's attention.
 *
 * The registry ships a full curation runbook for operators and stewards, describing
 * a workflow of working the queue, reviewing promotions and configuring
 * auto-promotion. None of it had a console surface: the memory-steward persona,
 * whose stated job is "is curation producing claims owners accept", was served by
 * one read-only claims list and nothing else. This is the first surface for it.
 *
 * Read-only, deliberately. The queue's actions — link, discard, adjudicate, confirm —
 * are writes against untrusted observations, and each needs its own capability entry
 * read from the router plus a confirmation flow that names the effect. Shipping the
 * view first means a steward can see the backlog while the write path is designed
 * properly rather than guessed at.
 */
export function useCurationQueue(
  client: RegistryClient,
  scope: KeyScope,
  params: { cursor?: string; pageSize?: number } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<Record<string, unknown>> {
  const query = {
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.pageSize ? { page_size: String(params.pageSize) } : {}),
  };

  return useQuery({
    queryKey: queryKeys.curationQueue(scope, query),
    queryFn: ({ signal }) =>
      client.request<Record<string, unknown>>('/v1/memory/curation-queue', { query, signal }),
    enabled: options.enabled ?? true,
  });
}

/**
 * The per-reason tally.
 *
 * A separate read because the endpoint says so: the number a curator needs before
 * opening the queue is not the page they open, and a tally needs no pagination. It
 * is also the only count on this surface that is a real total rather than a page
 * length.
 */
export function useCurationCounts(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<Record<string, unknown>> {
  return useQuery({
    queryKey: queryKeys.curationQueue(scope, { counts: 'true' }),
    queryFn: ({ signal }) =>
      client.request<Record<string, unknown>>('/v1/memory/curation-queue', {
        query: { counts: 'true' },
        signal,
      }),
    enabled: options.enabled ?? true,
  });
}
