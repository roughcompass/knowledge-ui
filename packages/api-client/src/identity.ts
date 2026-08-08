/**
 * Who the caller is, as the server resolves them.
 *
 * The role in this response is the only authority on what the reader may do. A UI
 * that decided its own permissions would offer actions the server then refuses,
 * so nothing else in this client infers a role.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';

type Schemas = components['schemas'];

export type WhoAmI = Schemas['WhoAmIResponse'];

/**
 * The caller's resolved identity.
 *
 * Never cached across personas: the key is scoped, so a switch cannot show one
 * identity's answer to another even if a cache clear were missed.
 */
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
