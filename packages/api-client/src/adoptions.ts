/**
 * Adoption: recording that this tenant depends on a capability.
 *
 * `GET /v1/capabilities/{id}/adoptions` returns **the calling tenant's own
 * adoption** for that one capability, not a roster of adopters. Adoption state is
 * therefore a per-capability read, and there is no cross-capability "my
 * adoptions" list to build one from: the consumer projection returns only nodes
 * and edges, with no version pin and no behind-status. Deriving that view
 * client-side would mean asserting state the server never did, so the surface is
 * absent rather than approximated.
 *
 * **Adopting has a server-side side effect, and unadopting does not undo it.**
 * The service is wired so that adopting transparently creates an inbox
 * subscription, and unadopting soft-deletes only the adoption row — so the
 * subscription survives and keeps delivering. Nothing in this module can fix
 * that; what it can do is not pretend otherwise, which is why the unadopt
 * confirmation says so. An earlier version of this docstring claimed adopting
 * "does not silently subscribe", which was the opposite of what the server does
 * and contradicted the dialog copy two files away.
 *
 * Read and write have different role gates. Listing admits every role; adopting
 * and unadopting are producer-or-admin and exclude consumer outright, so the
 * capability table needs two entries and a component must not infer one from the
 * other.
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
import type { components } from './generated/registry';
import { queryKeys, type KeyScope } from './keys';
import { IDEMPOTENCY_HEADER, compact, newIdempotencyKey } from './params';

type Schemas = components['schemas'];

export type Adoption = Schemas['AdoptionResponse'];
export type AdoptionListResponse = Schemas['AdoptionListResponse'];

/**
 * This tenant's adoption of one capability, or none.
 *
 * Returns the first item rather than the list because the endpoint is scoped to
 * the caller's own tenant: more than one active adoption of the same capability
 * by the same tenant is not a state the server produces, and a UI that rendered
 * a list here would be preparing for a case that cannot arrive.
 */
export function useAdoption(
  client: RegistryClient,
  scope: KeyScope,
  capabilityHandle: string | undefined,
): UseQueryResult<Adoption | null, RegistryError> {
  return useQuery({
    queryKey: queryKeys.adoption(scope, capabilityHandle ?? ''),
    enabled: Boolean(capabilityHandle),
    queryFn: async () => {
      const res = await client.request<AdoptionListResponse>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle as string)}/adoptions`,
      );
      return res.items.at(0) ?? null;
    },
  });
}

export interface AdoptInput {
  capabilityHandle: string;
  versionPin?: string | null;
  intent?: string | null;
}

export function useAdopt(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Adoption, RegistryError, AdoptInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ capabilityHandle, versionPin, intent }) =>
      client.request<Adoption>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle)}/adoptions`,
        {
          method: 'POST',
          body: compact({ version_pin: versionPin, intent }),
          headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
        },
      ),
    onSuccess: (_data, { capabilityHandle }) => {
      /*
       * Invalidate rather than seed the cache with the response. The detail page
       * must render adoption state from a server read, so that a POST which
       * succeeded and was then reversed elsewhere cannot leave the button
       * claiming a state that no longer holds.
       */
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adoption(scope, capabilityHandle),
      });
    },
  });
}

export function useUnadopt(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { capabilityHandle: string; adoptionId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ capabilityHandle, adoptionId }) => {
      await client.request<void>(
        `/v1/capabilities/${encodeURIComponent(capabilityHandle)}/adoptions/${encodeURIComponent(adoptionId)}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: (_data, { capabilityHandle }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adoption(scope, capabilityHandle),
      });
    },
  });
}
