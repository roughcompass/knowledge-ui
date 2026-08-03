import { HttpResponse, http } from 'msw';

import {
  makeErrorEnvelope,
  makeSupersededFact,
  makeSyncRun,
  makeSyncSource,
  makeTriggerReceipt,
  makeValidationEnvelope,
} from '../fixtures';
import { roleFor } from './role';

/**
 * The sync-connector endpoints — the first **stateful** handler group here.
 *
 * Every other group in this package is a pure generator: a request in, a freshly
 * minted fixture out. That is right for reads and useless for writes. A POST whose
 * effect is invisible to the next GET cannot exercise the thing a write page is
 * actually made of — invalidate, refetch, see the new row — so this group keeps a
 * module-scoped store.
 *
 * The consequence is a hazard worth stating plainly: `server.resetHandlers()` does
 * **not** clear module state. Call `resetAdminStore()` in test teardown, or one
 * test's created source appears in the next one's list.
 *
 * Shape notes, all reproducing real behaviour rather than a convenient version of it:
 *
 *   - the list endpoints return **bare JSON arrays**, not `{items, next_cursor}`,
 *     and take no cursor;
 *   - every endpoint is admin-only. Gating that here is what keeps the mocked lane
 *     from implying a permission the server does not grant — and what makes a
 *     "producer sees the refusal" test pass for the right reason;
 *   - `trigger` answers **202** with a `sync_run_id` that matches no row, exactly as
 *     the server does. It does not insert a run.
 */

interface StoredSource {
  source_id: string;
  tenant_id: string;
  display_name: string;
  source_type: string;
  config: Record<string, unknown>;
  schedule: string | null;
  credentials_ref: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

const KNOWN_TYPES = new Set([
  'openapi',
  'release_notes',
  'markdown_adr_rfc',
  'package_json',
  'docs_corpus',
]);

function seed(): StoredSource[] {
  return [
    makeSyncSource({ display_name: 'docs-corpus', source_type: 'docs_corpus' }),
    makeSyncSource({
      display_name: 'platform-openapi',
      source_type: 'openapi',
      config: { url: 'https://internal/openapi.json' },
      schedule: null,
    }),
    makeSyncSource({
      display_name: 'retired-adr-import',
      source_type: 'markdown_adr_rfc',
      is_active: false,
    }),
  ] as StoredSource[];
}

let sources: StoredSource[] = seed();

/**
 * Runs, keyed to the sources that exist.
 *
 * `source_id` is taken from the seeded sources rather than minted independently. A
 * run always belongs to a real source on the server, and a fixture that invents an
 * unrelated id is *less* faithful than the API: the runs page resolves the id to a
 * display name, so unmatched ids rendered a column of raw UUIDs, and the source
 * filter could never match anything.
 *
 * Timestamps descend, and the handler sorts, because the endpoint is
 * `order_by(started_at.desc())` — "newest first" is a property of the response, not
 * something the page arranges.
 */
function seedRuns(forSources: StoredSource[]) {
  // `seed()` returns three, so these are present. Asserted rather than
  // optional-chained: a silently id-less run is the bug this function exists to fix.
  const docs = forSources[0] as StoredSource;
  const openapi = forSources[1] as StoredSource;
  return [
    makeSyncRun({
      source_id: docs.source_id,
      status: 'done',
      trigger: 'schedule',
      started_at: '2026-08-02T03:00:00Z',
      finished_at: '2026-08-02T03:01:12Z',
    }),
    makeSyncRun({
      source_id: docs.source_id,
      status: 'running',
      trigger: 'manual',
      started_at: '2026-08-02T02:00:00Z',
      finished_at: null,
      duration_s: null,
      artifact_count: 412,
    }),
    makeSyncRun({
      source_id: openapi.source_id,
      status: 'partial',
      trigger: 'schedule',
      started_at: '2026-08-01T03:00:00Z',
      finished_at: '2026-08-01T03:00:53Z',
      duration_s: 53,
      artifact_count: 88,
      error_summary: '3 artifacts could not be parsed and were skipped',
    }),
    makeSyncRun({
      source_id: openapi.source_id,
      status: 'failed',
      trigger: 'schedule',
      started_at: '2026-07-31T03:00:00Z',
      finished_at: '2026-07-31T03:00:04Z',
      duration_s: 4,
      artifact_count: null,
      error_summary: 'connector could not reach https://internal/openapi.json (connect timeout)',
    }),
  ];
}

let runs = seedRuns(sources);

/**
 * Restore the seeded state.
 *
 * Required in teardown: `server.resetHandlers()` resets *handlers*, and these are
 * module bindings it never touches.
 */
export function resetAdminStore(): void {
  sources = seed();
  runs = seedRuns(sources);
}

/** Every route here is `require_roles([ROLE_ADMIN])`. */
const refuseNonAdmin = (request: Request) =>
  roleFor(request) === 'admin'
    ? null
    : HttpResponse.json(makeErrorEnvelope('forbidden', 'access denied'), { status: 403 });

export const adminSyncHandlers = [
  http.get('*/v1/admin/sync-sources', ({ request }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    /*
     * `active_only` defaults to **true** on the server —
     * `active_only: bool = Query(True)` in `admin_sync.py`. This mock defaulted to
     * showing everything, and that difference hid a real bug: a page that does not
     * ask for inactive sources loses them the moment they are deactivated, so the
     * Reactivate control became unreachable and the confirm dialog's promise that
     * deactivation is reversible "from this table" was false.
     *
     * Every test passed. The default is the whole reason it passed.
     */
    const param = new URL(request.url).searchParams.get('active_only');
    const activeOnly = param === null ? true : param !== 'false';
    const visible = activeOnly ? sources.filter((s) => s.is_active) : sources;
    // A bare array. No envelope, no cursor.
    return HttpResponse.json(visible);
  }),

  http.get('*/v1/admin/sync-sources/:sourceId', ({ request, params }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const found = sources.find((s) => s.source_id === params.sourceId);
    if (!found) {
      return HttpResponse.json(makeErrorEnvelope('not_found', 'sync_source not found'), {
        status: 404,
      });
    }
    return HttpResponse.json(found);
  }),

  http.post('*/v1/admin/sync-sources', async ({ request }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const body = (await request.json()) as Partial<StoredSource>;

    /*
     * Pydantic validates first, so a missing required field is a `$.`-pathed 422
     * and never reaches the connector lookup.
     */
    const missing = (['display_name', 'source_type'] as const).filter((f) => !body[f]);
    if (missing.length > 0) {
      return HttpResponse.json(
        makeValidationEnvelope(
          missing.map((f) => ({ path: `$.${f}`, code: 'missing', message: 'Field required' })),
        ),
        { status: 422 },
      );
    }

    /*
     * The connector lookup, and then `connector.validate()`, both raise
     * form-level 422s with `path: null`. A form that only renders field errors
     * shows nothing at all for these — which is why the mock produces them.
     */
    if (!KNOWN_TYPES.has(String(body.source_type))) {
      return HttpResponse.json(
        makeValidationEnvelope([
          {
            path: null,
            code: 'unprocessable_entity',
            message: `unknown connector type "${String(body.source_type)}"`,
          },
        ]),
        { status: 422 },
      );
    }

    const created = makeSyncSource({
      display_name: body.display_name,
      source_type: body.source_type,
      // The server normalises this, so the response is not simply the request
      // echoed back.
      config: body.config ?? {},
      schedule: body.schedule ?? null,
      credentials_ref: body.credentials_ref ?? null,
      is_active: true,
    }) as StoredSource;

    sources = [...sources, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch('*/v1/admin/sync-sources/:sourceId', async ({ request, params }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const index = sources.findIndex((s) => s.source_id === params.sourceId);
    if (index < 0) {
      return HttpResponse.json(makeErrorEnvelope('not_found', 'sync_source not found'), {
        status: 404,
      });
    }

    const patch = (await request.json()) as Partial<StoredSource>;
    const current = sources[index] as StoredSource;

    /*
     * Field by field, and only the five `SyncSourcePatch` declares. Spreading the
     * body wholesale would write `undefined` over fields the caller never mentioned
     * — turning a partial update into a replace — and would also let a client patch
     * `source_id` or `created_at`, which the real schema does not accept.
     */
    const next: StoredSource = {
      ...current,
      display_name: patch.display_name ?? current.display_name,
      config: patch.config ?? current.config,
      schedule: patch.schedule !== undefined ? patch.schedule : current.schedule,
      credentials_ref:
        patch.credentials_ref !== undefined ? patch.credentials_ref : current.credentials_ref,
      is_active: patch.is_active !== undefined ? patch.is_active : current.is_active,
    };

    sources = sources.map((s, i) => (i === index ? next : s));
    return HttpResponse.json(next);
  }),

  http.post('*/v1/admin/sync-sources/:sourceId/trigger', ({ request, params }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const found = sources.find((s) => s.source_id === params.sourceId);
    if (!found) {
      return HttpResponse.json(makeErrorEnvelope('not_found', 'sync_source not found'), {
        status: 404,
      });
    }

    // The reachable 409, with the server's own wording.
    if (!found.is_active) {
      return HttpResponse.json(
        makeErrorEnvelope('conflict', 'sync_source is inactive; re-activate before triggering'),
        { status: 409 },
      );
    }

    /*
     * 202, and deliberately NO run row. The server schedules the job and mints an
     * id for the receipt only; the row appears when the job runs. Inserting one
     * here would make a page that links the receipt to a detail route appear to
     * work in tests and 404 in production.
     */
    return HttpResponse.json(makeTriggerReceipt({ source_id: found.source_id }), { status: 202 });
  }),

  http.get('*/v1/admin/sync-runs', ({ request }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const url = new URL(request.url);
    const sourceId = url.searchParams.get('source_id');
    const status = url.searchParams.get('status');

    let visible = runs;
    if (sourceId) visible = visible.filter((r) => r.source_id === sourceId);
    if (status) visible = visible.filter((r) => r.status === status);
    // The server sorts; the page must not have to.
    visible = [...visible].sort((a, b) => b.started_at.localeCompare(a.started_at));
    return HttpResponse.json(visible);
  }),

  http.get('*/v1/admin/sync-runs/:runId', ({ request, params }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;

    const found = runs.find((r) => r.sync_run_id === params.runId);
    if (!found) {
      // Also what a trigger receipt's id gets, which is the point.
      return HttpResponse.json(makeErrorEnvelope('not_found', 'sync_run not found'), {
        status: 404,
      });
    }
    return HttpResponse.json(found);
  }),

  http.get('*/v1/admin/sync-runs/:runId/superseded', ({ request }) => {
    const refused = refuseNonAdmin(request);
    if (refused) return refused;
    return HttpResponse.json([makeSupersededFact(), makeSupersededFact()]);
  }),
];
