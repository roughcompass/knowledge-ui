import { useQueries } from '@tanstack/react-query';

import { queryKeys, type KeyScope } from './keys';
import type { RegistryClient } from './client';

/**
 * Resolves entity ids to the names a person would say.
 *
 * Several endpoints answer with ids and no names — the traversal reads, the usage
 * rankings, the audit log's target, a workspace entry's references. A table of those
 * is a table a reader cannot use: two rows cannot be told apart, and the one thing
 * that would identify them is the one thing not on screen.
 *
 * Three disciplines keep this from becoming a request storm, and they matter more
 * than the hook:
 *
 * 1. **A name the server sent always wins.** Search hits, graph projections and the
 *    owned-usage rows all carry names already; a caller that has one passes it and
 *    this never fires. It is the fallback, not the default.
 * 2. **Only what is on screen.** Ids come from the current page of a table, so the
 *    fan-out is bounded by page size rather than by the size of the tenant.
 * 3. **The cache is shared with the detail page.** Each resolution writes into the
 *    same key the capability detail read uses, so opening a row it named is warm
 *    rather than a second request for what was just fetched.
 *
 * An id that answers 404 or 403 resolves to `undefined` and stays an id on screen.
 * That is not an error: cross-tenant edges are real, and a reference this tenant
 * cannot read is a fact about visibility rather than a failure to render.
 *
 * This is an N+1 by construction, and it is the honest shape available — the contextplane
 * publishes no batch resolve. If one ever lands, it goes behind this same signature.
 */
export function useEntityNames(
  client: RegistryClient,
  scope: KeyScope,
  ids: readonly string[],
): Record<string, string> {
  // Deduplicated and bounded. A page of twenty rows referencing the same capability
  // five times is one request, not five.
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 40);

  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: queryKeys.capability(scope, id, {}),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        client.request<Record<string, unknown>>(`/v1/capabilities/${encodeURIComponent(id)}`, {
          signal,
        }),
      // Long, because a display name is the least volatile thing about a capability
      // and this runs once per visible row.
      staleTime: 5 * 60_000,
      // A reference that cannot be read is a normal outcome here, so a retry only
      // multiplies the cost of the common case.
      retry: false,
    })),
  });

  const names: Record<string, string> = {};
  unique.forEach((id, index) => {
    const data = results[index]?.data;
    if (!data) return;
    const attributes = (data.attributes ?? {}) as Record<string, unknown>;
    const entity = (data.entity ?? {}) as Record<string, unknown>;
    const name =
      (typeof attributes.display_name === 'string' && attributes.display_name) ||
      (typeof entity.name === 'string' && entity.name) ||
      undefined;
    if (name) names[id] = name;
  });

  return names;
}
