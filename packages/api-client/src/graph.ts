/**
 * The graph: the tenant's projections, and the ontology that constrains them.
 *
 * ## What the API serves, and what it does not
 *
 * This is the whole surface, and the gap in it decides what a dashboard is
 * allowed to say:
 *
 * | Read | Endpoint | Gate |
 * | --- | --- | --- |
 * | What the tenant ships | `GET /v1/graph/provider` | any role |
 * | What the tenant consumes | `GET /v1/graph/consumer` | any role |
 * | Entity types and edge relations | `GET /v1/admin/vocabularies/{kind}` | admin |
 * | Capability type schemas | `GET /v1/admin/capability-types` | admin |
 * | Edge property schemas | `GET /v1/admin/edge-property-schemas` | admin |
 *
 * **There is no endpoint that counts anything.** No entity total, no edge total,
 * no triple count, no per-type histogram. The projections page a cursor and
 * carry `next_cursor` with no `total`; the vocabulary and schema endpoints
 * return bare arrays with no envelope at all.
 *
 * That is why this module exports no count and no summary type. A "graph size"
 * figure would have to be assembled in the browser out of however many pages the
 * client happened to fetch, which measures the client's paging rather than the
 * graph — the same mistake as deriving a rate from a single metrics scrape. A
 * screen that needs a total has to say the contextplane does not publish one.
 *
 * ## What *is* countable, and why
 *
 * The ontology endpoints return the complete set in one response: every
 * vocabulary value for a kind, every capability type, every edge property schema.
 * Saying "nine edge relations are defined" is therefore reporting the response,
 * not deriving a total from a sample — and the distinction is the whole reason
 * the projections below are described as pages rather than as populations.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { EntityRef } from './catalog';
import { queryKeys, type KeyScope } from './keys';
import { compact } from './params';

/**
 * The two projections the API serves.
 *
 * Provider is what this tenant publishes; consumer is what it depends on. They
 * are separate endpoints rather than one with a direction parameter, so they are
 * two values here rather than a boolean.
 */
export const PROJECTION_DIRECTIONS = ['provider', 'consumer'] as const;
export type ProjectionDirection = (typeof PROJECTION_DIRECTIONS)[number];

/** Mirrors `EdgeRefItem`. The bitemporal columns arrive only under `view=audit`. */
export interface GraphEdge {
  edge_id: string;
  src_entity_id: string;
  rel: string;
  dst_entity_id: string;
  properties?: Record<string, unknown> | null;
  valid_from?: string | null;
  valid_to?: string | null;
  ingested_at?: string | null;
  invalidated_at?: string | null;
  tenant_id?: string | null;
}

/**
 * Mirrors `ProjectionResponse`.
 *
 * No `total`, deliberately reproduced: the absence is the contract. `next_cursor`
 * being non-null is the only thing the response says about what is beyond it —
 * not how much.
 */
export interface ProjectionResponse {
  nodes: EntityRef[];
  edges: GraphEdge[];
  next_cursor: string | null;
}

export interface ProjectionParams {
  pageSize?: number;
  cursor?: string | null;
}

export function useGraphProjection(
  client: RegistryClient,
  scope: KeyScope,
  direction: ProjectionDirection,
  params: ProjectionParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<ProjectionResponse, RegistryError> {
  const query = compact({
    page_size: params.pageSize,
    cursor: params.cursor,
  });

  return useQuery({
    queryKey: queryKeys.graphProjection(scope, direction, query),
    enabled: options.enabled ?? true,
    queryFn: () => client.request<ProjectionResponse>(`/v1/graph/${direction}`, { query }),
  });
}

/**
 * The vocabulary kinds this console reads.
 *
 * Named here because the endpoint takes `kind` as a free path segment and offers
 * **no way to list the kinds that exist** — there is no `GET /v1/admin/vocabularies`.
 * These two are the ones the graph is built from: `entity_type` is the set of
 * things a node may be, `edge_rel` the set of relations an edge may carry, and
 * the seed format documents both by name.
 *
 * A screen showing them must say that this is a chosen pair rather than a
 * complete list, because a tenant may hold kinds this console never asks for and
 * nothing in the response would reveal it.
 */
export const GRAPH_VOCABULARY_KINDS = ['entity_type', 'edge_rel'] as const;
export type GraphVocabularyKind = (typeof GRAPH_VOCABULARY_KINDS)[number];

/** Mirrors `VocabularyValueResponse`. */
export interface VocabularyValue {
  vocab_id: string;
  kind: string;
  value: string;
  /** Seeded by the contextplane rather than added by this tenant; not deletable. */
  is_system: boolean;
  /** Non-null means retired: existing rows may still reference it, new ones may not. */
  deprecated_at: string | null;
  created_at: string;
}

export function useVocabulary(
  client: RegistryClient,
  scope: KeyScope,
  kind: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<VocabularyValue[], RegistryError> {
  return useQuery({
    queryKey: queryKeys.vocabulary(scope, kind),
    enabled: options.enabled ?? true,
    queryFn: () =>
      client.request<VocabularyValue[]>(`/v1/admin/vocabularies/${encodeURIComponent(kind)}`),
  });
}

/**
 * Mirrors `CapabilityTypeSchemaResponse`.
 *
 * `is_advisory` is the field that matters to a reader: an advisory schema
 * describes what a capability of this type *should* carry and does not refuse a
 * write that ignores it, while an enforcing one rejects the write. The two look
 * identical in a list that omits the flag.
 */
export interface CapabilityTypeSchema {
  schema_id: string;
  type_name: string;
  json_schema: Record<string, unknown>;
  is_advisory: boolean;
  t_valid_from: string;
  t_valid_to: string | null;
  t_ingested_at: string;
  t_invalidated_at: string | null;
}

export function useCapabilityTypes(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<CapabilityTypeSchema[], RegistryError> {
  return useQuery({
    queryKey: queryKeys.capabilityTypes(scope),
    enabled: options.enabled ?? true,
    queryFn: () => client.request<CapabilityTypeSchema[]>('/v1/admin/capability-types'),
  });
}

/**
 * An edge property schema: the JSON Schema an edge of a given relation must
 * satisfy in its `properties` bag.
 *
 * Typed loosely on purpose. The spec declares this response as an array of
 * untyped items — `{"items": {}}` — so anything more specific here would be a
 * shape this client invented, and the screens read only the two fields the
 * router is known to send.
 */
export interface EdgePropertySchema {
  schema_id?: string;
  rel?: string;
  json_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export function useEdgePropertySchemas(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<EdgePropertySchema[], RegistryError> {
  return useQuery({
    queryKey: queryKeys.edgePropertySchemas(scope),
    enabled: options.enabled ?? true,
    queryFn: () => client.request<EdgePropertySchema[]>('/v1/admin/edge-property-schemas'),
  });
}
