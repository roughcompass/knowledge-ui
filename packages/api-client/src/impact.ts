/**
 * Impact: what a capability depends on, what depends on it, and how far a change
 * would travel.
 *
 * Three reads over the same graph, answering three different questions, which is
 * why they are three endpoints rather than one with a direction flag:
 *
 * - **dependencies** — what this capability needs. Read before building on it.
 * - **dependents** — who needs this capability. Read before changing it.
 * - **blast radius** — the transitive closure, cache-first, with the nodes as
 *   well as the edges. Read before a breaking change.
 *
 * ## Every parameter changes the answer, so every parameter is in the cache key
 *
 * `depth`, `direction`, `edge_types` and `as_of` all alter what comes back. A key
 * that included only the root would serve a depth-1 result under a depth-3
 * heading, which is the kind of wrong that looks right — so the keys carry the
 * whole parameter set.
 *
 * `as_of` is the bi-temporal lever, and it is the reason this surface can answer a
 * question a diagram cannot: what the graph looked like when a decision was made,
 * rather than what it looks like now.
 *
 * ## What the traversal tells you about itself
 *
 * The response carries `cache_hit` and `version_satisfied` alongside the graph.
 * Both are reported rather than dropped: a cached closure may be stale relative to
 * an edge written a moment ago, and `version_satisfied` records which version
 * constraints the traversal could actually resolve. A blast radius presented
 * without them looks like a complete answer, and the cases where it is not are
 * exactly the cases where someone is about to ship a breaking change.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';
import { compact, toApiTimestamp } from './params';

type Schemas = components['schemas'];

export type Traversal = Schemas['TraversalResultResponse'];
export type Dependencies = Schemas['DependencyResponse'];
export type EdgeRef = Schemas['EdgeRefItem'];

/**
 * How deep to walk.
 *
 * One to five, because that is the range the server accepts and caps at — offering
 * more would be refused, and offering fewer would hide reach that is available.
 * A closed set rather than a free number because an arbitrary depth on a dense
 * graph is a slow query whose result nobody reads.
 */
export const TRAVERSAL_DEPTHS = [1, 2, 3, 4, 5] as const;
export type TraversalDepth = (typeof TRAVERSAL_DEPTHS)[number];

export interface TraversalQuery {
  depth?: TraversalDepth;
  /**
   * Relationship types to follow. Omitted means every dependency relationship.
   *
   * Note this is accepted by the two traversal endpoints and **not** by
   * `dependencies`, which declares no such parameter — so it is not part of that
   * hook's query.
   */
  edgeTypes?: readonly string[];
  /** The instant to traverse as of. Omitted means now. */
  asOf?: Date | string;
}

/**
 * Which way to walk, in the server's words.
 *
 * `forward` is dependencies, `reverse` is dependents, and the server's default is
 * `reverse`. Spelled exactly as the API spells it rather than as `upstream` and
 * `downstream`, which read more naturally and are values the API does not define:
 * an unrecognised string here would fall back to the server's default, so asking
 * for one direction could silently return the other. A friendlier vocabulary
 * translated at the boundary was the alternative, and it is one more place for the
 * mapping to be wrong.
 */
export type TraversalDirection = 'forward' | 'reverse';

/** Parameters both traversal endpoints accept. */
function traversalParams(query: TraversalQuery) {
  return compact({
    depth: query.depth,
    /*
     * One comma-joined string, because that is what the parameter is: the document
     * declares `edge_types` as a nullable string described as "comma-separated
     * edge_rel vocab values".
     *
     * Passing an array made the client serialize it as a repeated parameter, and a
     * server binding a single string reads only the first occurrence — so
     * selecting three relationship types silently filtered on one, with no error
     * and nothing on screen to suggest it. Confirmed on the wire.
     */
    edge_types:
      query.edgeTypes && query.edgeTypes.length > 0 ? query.edgeTypes.join(',') : undefined,
    as_of: query.asOf ? toApiTimestamp(query.asOf) : undefined,
  });
}

/**
 * Parameters `dependencies` accepts, which is a smaller set.
 *
 * That endpoint declares only `depth` and `as_of`. Sending `edge_types` there was a
 * no-op on the server *and* varied the cache key, so two identical answers were
 * cached separately — a wasted entry rather than a wrong one, and still worth not
 * doing.
 */
function dependencyParams(query: TraversalQuery) {
  return compact({
    depth: query.depth,
    as_of: query.asOf ? toApiTimestamp(query.asOf) : undefined,
  });
}

/** What this capability depends on. */
export function useDependencies(
  client: RegistryClient,
  scope: KeyScope,
  handle: string | undefined,
  query: TraversalQuery = {},
): UseQueryResult<Dependencies, RegistryError> {
  const params = dependencyParams(query);
  return useQuery({
    queryKey: queryKeys.dependencies(scope, handle ?? '', params),
    queryFn: ({ signal }) =>
      client.request<Dependencies>(
        `/v1/capabilities/${encodeURIComponent(handle as string)}/dependencies`,
        { query: params, signal },
      ),
    enabled: Boolean(handle),
  });
}

/** Who depends on this capability — the reverse walk, and the one a producer needs. */
export function useDependents(
  client: RegistryClient,
  scope: KeyScope,
  handle: string | undefined,
  query: TraversalQuery = {},
): UseQueryResult<Traversal, RegistryError> {
  const params = traversalParams(query);
  return useQuery({
    queryKey: queryKeys.dependents(scope, handle ?? '', params),
    queryFn: ({ signal }) =>
      client.request<Traversal>(
        `/v1/capabilities/${encodeURIComponent(handle as string)}/dependents`,
        { query: params, signal },
      ),
    enabled: Boolean(handle),
  });
}

/** The transitive closure in a named direction. */
export function useBlastRadius(
  client: RegistryClient,
  scope: KeyScope,
  handle: string | undefined,
  query: TraversalQuery & { direction?: TraversalDirection } = {},
): UseQueryResult<Traversal, RegistryError> {
  const params = compact({ ...traversalParams(query), direction: query.direction });
  return useQuery({
    queryKey: queryKeys.blastRadius(scope, handle ?? '', params),
    queryFn: ({ signal }) =>
      client.request<Traversal>(
        `/v1/capabilities/${encodeURIComponent(handle as string)}/blast-radius`,
        { query: params, signal },
      ),
    enabled: Boolean(handle),
  });
}

/**
 * Group edges by relationship type, preserving the order they arrived in.
 *
 * The graph is rendered as a list before it is rendered as anything else, and a
 * flat list of edges is unreadable past about a dozen. Grouping by relationship is
 * what makes it scannable — "three things call this, one deploys it" — and it is
 * also the grouping a reader would otherwise do in their head.
 *
 * Insertion-ordered rather than sorted, because the server returns edges in
 * traversal order and re-sorting would discard the only ordering information the
 * response carries.
 */
export function edgesByRelationship(edges: readonly EdgeRef[]): Map<string, EdgeRef[]> {
  const grouped = new Map<string, EdgeRef[]>();
  for (const edge of edges) {
    const existing = grouped.get(edge.rel);
    if (existing) existing.push(edge);
    else grouped.set(edge.rel, [edge]);
  }
  return grouped;
}

/**
 * Whether a traversal answered with everything it was asked for.
 *
 * A closure served from cache, or one that could not satisfy a version
 * constraint, is a partial answer — and the reader deciding whether to ship a
 * breaking change is the one person who must not be told a partial answer is
 * complete. Returns the reasons rather than a boolean so the screen can say which
 * of them applied.
 */
export function traversalCaveats(traversal: Traversal): string[] {
  const caveats: string[] = [];
  if (traversal.cache_hit) {
    caveats.push(
      'Served from a cached closure, so an edge written in the last moments may be missing.',
    );
  }
  const unsatisfied = Object.entries(traversal.version_satisfied ?? {}).filter(
    ([, satisfied]) => satisfied === false,
  );
  if (unsatisfied.length > 0) {
    caveats.push(
      `${unsatisfied.length} version constraint${unsatisfied.length === 1 ? '' : 's'} could not be resolved, so those edges are reported without version agreement.`,
    );
  }
  return caveats;
}
