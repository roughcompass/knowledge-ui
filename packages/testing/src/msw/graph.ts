import { HttpResponse, http } from 'msw';

import { CATALOG, type CatalogEntry } from '../fixtures/catalog';
import { roleFor } from './role';

/**
 * Handlers for the graph projections and the ontology behind them.
 *
 * ## The projections are built from the catalog roster, not invented beside it
 *
 * A graph fixture that named its own nodes would show a reader one set of
 * capabilities on `/catalog` and a different set on `/graph`, and the screens
 * would look plausible in isolation while disagreeing about what the tenant
 * owns. So both projections are derived from `CATALOG` and its `depends_on`
 * edges — the same source the capability list, the search ranking and the impact
 * traversals already read. Renaming a capability in one place renames it
 * everywhere, which is the only way a mock stays coherent as it grows.
 *
 * The split follows the endpoints' own descriptions: **provider** is what this
 * tenant ships, so it carries every roster entry and the dependency edges that
 * originate inside it; **consumer** is what this tenant depends on, so it
 * carries only the entries something else depends on, with the edges that reach
 * them. The two overlap heavily and are meant to — a shared platform both ships
 * and consumes — but they are not the same list, and a component that assumed
 * they were would pass against a fixture that returned one twice.
 *
 * ## Entity ids are derived, not generated
 *
 * `makeEntityRef` mints a fresh uuid per call, which is right for a list where
 * nothing points at anything. It is wrong here: an edge names its endpoints by
 * `src_entity_id` and `dst_entity_id`, and random ids would produce a response
 * whose edges reference nodes that are not in it. So ids are derived from the
 * capability name and are stable across both projections and across requests,
 * which is what lets a screen actually resolve an edge to a node.
 *
 * ## No totals, because the endpoint has none
 *
 * `ProjectionResponse` carries `nodes`, `edges` and `next_cursor` and nothing
 * else. This mock reproduces that exactly — no `total`, no count field, not even
 * a helpful one — so a page that wants to report the size of the graph has no
 * way to get it from here and has to say so instead.
 *
 * ## The ontology is admin-gated, as it is on the server
 *
 * Vocabularies, capability types and edge-property schemas are all under
 * `/v1/admin/*` behind `_admin_required`, so these handlers refuse a non-admin
 * caller with a 403 rather than answering everyone. A mock that answered every
 * role would let a component ship an ontology panel to a consumer and still pass
 * its tests.
 */

const DEFAULT_PAGE_SIZE = 20;

/** A stable, readable entity id for a roster name. */
function entityId(name: string): string {
  return `ent-${name}`;
}

function nodeFor(row: CatalogEntry) {
  return {
    entity_id: entityId(row.name),
    tenant_id: 'tenant-cib-digital-enablement',
    entity_type: row.entity_type,
    name: row.name,
    external_id: row.external_id,
    is_active: row.lifecycle !== 'retired',
    created_at: '2026-06-01T00:00:00Z',
  };
}

/**
 * Every dependency edge in the roster, flattened.
 *
 * `properties` carries the criticality the contextplane's edge-property schema
 * allows, rather than an empty object: the field is required on `EdgeRefItem`
 * and a fixture that always sent `{}` would let a table that cannot render a
 * populated bag pass.
 */
const ALL_EDGES = CATALOG.flatMap((row) =>
  row.depends_on.map((target) => ({
    edge_id: `edge-${row.name}--depends_on--${target}`,
    src_entity_id: entityId(row.name),
    rel: 'depends_on',
    dst_entity_id: entityId(target),
    properties: { criticality: row.tier === '1' ? 'high' : 'normal' },
  })),
);

/** The names something in the roster depends on — the consumed set. */
const CONSUMED = new Set(CATALOG.flatMap((row) => row.depends_on));

function decodeCursor(raw: string | null): number {
  if (!raw) return 0;
  const parsed = Number.parseInt(raw.replace(/^offset:/, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function projection(request: Request, rows: readonly CatalogEntry[]) {
  const url = new URL(request.url);
  const pageSize = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('page_size') ?? '', 10) || DEFAULT_PAGE_SIZE, 1),
    500,
  );
  const offset = decodeCursor(url.searchParams.get('cursor'));
  const page = rows.slice(offset, offset + pageSize);
  const ids = new Set(page.map((row) => entityId(row.name)));
  const nextOffset = offset + page.length;

  return HttpResponse.json({
    nodes: page.map(nodeFor),
    // Only the edges whose *source* is on this page. The endpoint returns the
    // slice's own edges rather than every edge touching it, so an edge may point
    // at a node that is on a later page — which is exactly the case a screen
    // resolving edges to nodes has to handle.
    edges: ALL_EDGES.filter((edge) => ids.has(edge.src_entity_id)),
    next_cursor: nextOffset < rows.length ? `offset:${nextOffset}` : null,
  });
}

function refuseNonAdmin(request: Request) {
  const role = roleFor(request);
  if (role === 'admin') return null;
  return HttpResponse.json(
    {
      errors: [{ code: 'forbidden', message: `role ${role} may not read the ontology` }],
    },
    { status: 403 },
  );
}

/**
 * The vocabulary values, keyed by kind.
 *
 * `entity_type` and `edge_rel` are the two kinds the graph is built from, and
 * both are seeded by the contextplane rather than by a tenant — hence `is_system` on
 * every row. One deprecated value is included on purpose: a deprecated term is
 * still referenced by existing rows and must render differently from a live one,
 * which a fixture of uniformly live values would never exercise.
 */
const VOCABULARIES: Record<string, { value: string; is_system: boolean; deprecated?: string }[]> = {
  entity_type: [
    { value: 'capability', is_system: true },
    { value: 'concept', is_system: true },
    { value: 'operation', is_system: true },
  ],
  edge_rel: [
    { value: 'depends_on', is_system: true },
    { value: 'composes', is_system: true },
    { value: 'implements', is_system: true },
    { value: 'supersedes', is_system: true },
    { value: 'exposes', is_system: true },
    { value: 'governed_by', is_system: false },
    { value: 'owned_by', is_system: false },
    { value: 'related_to', is_system: false, deprecated: '2026-05-14T09:00:00Z' },
  ],
};

export const graphHandlers = [
  http.get('*/v1/graph/provider', ({ request }) => projection(request, CATALOG)),

  http.get('*/v1/graph/consumer', ({ request }) =>
    projection(
      request,
      CATALOG.filter((row) => CONSUMED.has(row.name)),
    ),
  ),

  http.get('*/v1/admin/vocabularies/:kind', ({ params, request }) => {
    const denied = refuseNonAdmin(request);
    if (denied) return denied;

    const kind = String(params.kind);
    const values = VOCABULARIES[kind] ?? [];

    // A bare array with no envelope, matching the endpoint: no cursor, no total.
    return HttpResponse.json(
      values.map((entry, i) => ({
        vocab_id: `vocab-${kind}-${i}`,
        kind,
        value: entry.value,
        is_system: entry.is_system,
        deprecated_at: entry.deprecated ?? null,
        created_at: '2026-01-15T00:00:00Z',
      })),
    );
  }),

  http.get('*/v1/admin/capability-types', ({ request }) => {
    const denied = refuseNonAdmin(request);
    if (denied) return denied;

    return HttpResponse.json([
      {
        schema_id: 'cts-capability',
        type_name: 'capability',
        json_schema: {
          type: 'object',
          required: ['owner', 'lifecycle'],
          properties: {
            owner: { type: 'string' },
            tier: { type: 'string', enum: ['1', '2', '3'] },
            lifecycle: { type: 'object' },
          },
        },
        // Enforcing: a write that omits `owner` is refused.
        is_advisory: false,
        t_valid_from: '2026-01-15T00:00:00Z',
        t_valid_to: null,
        t_ingested_at: '2026-01-15T00:00:00Z',
        t_invalidated_at: null,
      },
      {
        schema_id: 'cts-concept',
        type_name: 'concept',
        json_schema: {
          type: 'object',
          properties: { owner: { type: 'string' }, definition: { type: 'string' } },
        },
        // Advisory: the same omission is recorded, not refused. Both states are
        // present because a list that showed one could not teach the difference.
        is_advisory: true,
        t_valid_from: '2026-02-02T00:00:00Z',
        t_valid_to: null,
        t_ingested_at: '2026-02-02T00:00:00Z',
        t_invalidated_at: null,
      },
      {
        schema_id: 'cts-operation',
        type_name: 'operation',
        json_schema: {
          type: 'object',
          required: ['owner'],
          properties: { owner: { type: 'string' }, idempotent: { type: 'boolean' } },
        },
        is_advisory: true,
        t_valid_from: '2026-02-02T00:00:00Z',
        t_valid_to: null,
        t_ingested_at: '2026-02-02T00:00:00Z',
        t_invalidated_at: null,
      },
    ]);
  }),

  http.get('*/v1/admin/edge-property-schemas', ({ request }) => {
    const denied = refuseNonAdmin(request);
    if (denied) return denied;

    return HttpResponse.json([
      {
        schema_id: 'eps-depends-on',
        rel: 'depends_on',
        json_schema: {
          type: 'object',
          properties: { criticality: { type: 'string', enum: ['high', 'normal', 'low'] } },
        },
      },
      {
        schema_id: 'eps-supersedes',
        rel: 'supersedes',
        json_schema: {
          type: 'object',
          properties: { effective_from: { type: 'string', format: 'date' } },
        },
      },
    ]);
  }),
];
