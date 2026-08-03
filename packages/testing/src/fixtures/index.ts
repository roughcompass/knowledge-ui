/**
 * Fixtures shaped like the server's actual responses.
 *
 * The rule here is that a fixture must never be richer than the endpoint it
 * stands for. A fixture that carries a field the API does not return teaches
 * every test written against it the wrong shape, and the resulting code fails
 * only against the real server — which is the most expensive place to find out.
 * The list fixture below is the concrete case: it deliberately has no lifecycle.
 */

/** The real lifecycle vocabulary. Not `draft` or `active`. */
export const LIFECYCLE = ['alpha', 'beta', 'ga', 'deprecated', 'retired'] as const;
export type Lifecycle = (typeof LIFECYCLE)[number];

let seq = 0;
const uuid = (prefix: string) => `${prefix}-0000-0000-0000-${String(++seq).padStart(12, '0')}`;

export function makeWhoami(
  overrides: Partial<{
    role: string;
    tenantSlug: string;
    tenantDisplayName: string;
    actorDisplayName: string | null;
  }> = {},
) {
  const role = overrides.role ?? 'consumer';
  return {
    actor_id: uuid('actor'),
    actor_display_name: overrides.actorDisplayName ?? 'knowledge-ui-dev',
    actor_email: null,
    tenant_id: uuid('tenant'),
    tenant_slug: overrides.tenantSlug ?? 'dev',
    tenant_display_name: overrides.tenantDisplayName ?? 'Local Development Tenant',
    // Always exactly one element — the server collapses grants before responding.
    roles: [role],
    _links: { self: '/v1/whoami' },
  };
}

/**
 * A capabilities LIST item.
 *
 * Exactly the seven fields the endpoint returns. No `lifecycle`, no
 * `attributes`, no `facts` — those live on the detail resource only, which is
 * why the list screen filters by lifecycle rather than showing a column for it.
 */
export function makeEntityRef(overrides: Partial<Record<string, unknown>> = {}) {
  const n = ++seq;
  return {
    entity_id: uuid('entity'),
    tenant_id: uuid('tenant'),
    entity_type: 'capability',
    name: `capability-${n}`,
    external_id: null,
    is_active: true,
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

/** The detail resource, which does carry lifecycle and attributes. */
export function makeCapabilityDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entity: makeEntityRef(),
    lifecycle: 'ga' satisfies Lifecycle,
    /*
     * Attribute values are `unknown`, not strings. The real server returns
     * `lifecycle: {"state": "beta"}` for a bitemporal attribute, and a fixture with
     * only string values let a page get away with `String(value)` — which renders a
     * dict as "[object Object]". The object entry is here so that cannot regress.
     */
    attributes: { owner: 'payments-platform', tier: '1', lifecycle: { state: 'beta' } },
    facts: [
      {
        fact_id: uuid('fact'),
        category: 'overview',
        body: 'Card payment authorisation and settlement.',
        is_authoritative: true,
      },
    ],
    edges_out: [],
    edges_in: [],
    _links: { self: '/v1/capabilities/capability-1' },
    ...overrides,
  };
}

export function makeSearchHit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entity_id: uuid('entity'),
    tenant_id: uuid('tenant'),
    name: 'payments-service',
    entity_type: 'capability',
    score: 0.87,
    retrieval_arms: { semantic: 0.6, lexical: 0.25, graph: 0.02 },
    matching_facts: [],
    ...overrides,
  };
}

export function makeAuditRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    audit_id: uuid('audit'),
    actor_id: uuid('actor'),
    action: 'lifecycle.transition',
    target_type: 'entity',
    target_id: uuid('entity'),
    before_jsonb: { lifecycle: 'beta' },
    after_jsonb: { lifecycle: 'ga' },
    ts: '2026-07-01T09:30:00Z',
    request_id: 'req-abc123',
    error_code: null,
    ...overrides,
  };
}

/** The error envelope. `available_tenants` belongs INSIDE the item. */
export function makeErrorEnvelope(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return { errors: [{ path: null, code, message, ...extra }] };
}

export function makeTenantRequired(tenants: string[] = ['dev', 'acme']) {
  return makeErrorEnvelope('tenant_required', 'select a tenant with the X-Tenant-ID header', {
    available_tenants: tenants,
  });
}

/**
 * A small but structurally real Prometheus exposition: a labelled counter, a
 * histogram split across its three suffixes, and a gauge.
 */
export const METRICS_TEXT = `# HELP registry_entitlement_calls_total Entitlement service calls.
# TYPE registry_entitlement_calls_total counter
registry_entitlement_calls_total{status_class="2xx"} 42.0
registry_entitlement_calls_total{status_class="5xx_cacheable"} 3.0
# HELP registry_entitlement_call_duration_seconds Entitlement call latency.
# TYPE registry_entitlement_call_duration_seconds histogram
registry_entitlement_call_duration_seconds_bucket{le="0.05"} 30.0
registry_entitlement_call_duration_seconds_bucket{le="0.25"} 44.0
registry_entitlement_call_duration_seconds_bucket{le="+Inf"} 45.0
registry_entitlement_call_duration_seconds_sum 2.8
registry_entitlement_call_duration_seconds_count 45.0
# HELP catalog_outbox_pending_size Pending embedding outbox rows.
# TYPE catalog_outbox_pending_size gauge
catalog_outbox_pending_size 7.0
# HELP catalog_audit_write_failures_total Audit writes that failed.
# TYPE catalog_audit_write_failures_total counter
catalog_audit_write_failures_total 0.0
`;

/*
 * ADMIN: SYNC
 *
 * Every nullable-but-required field is present as `null` rather than omitted.
 * The server declares `finished_at`, `duration_s`, `artifact_count`,
 * `error_summary`, `credentials_ref`, `schedule` and `created_by` as required
 * *and* nullable, so a fixture that leaves them out teaches the wrong shape —
 * a page written against it would never handle the null.
 */

/** The connector types the server accepts. Keys of the CONNECTORS dict. */
export const SYNC_SOURCE_TYPE = [
  'openapi',
  'release_notes',
  'markdown_adr_rfc',
  'package_json',
  'docs_corpus',
] as const;

export function makeSyncSource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source_id: uuid('source'),
    tenant_id: uuid('tenant'),
    display_name: 'docs-corpus',
    source_type: 'docs_corpus',
    config: { root: 'docs/', glob: '**/*.md' },
    schedule: '0 3 * * *',
    credentials_ref: null,
    is_active: true,
    created_at: '2026-07-01T09:00:00Z',
    created_by: uuid('actor'),
    ...overrides,
  };
}

export function makeSyncRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sync_run_id: uuid('run'),
    source_id: uuid('source'),
    tenant_id: uuid('tenant'),
    status: 'done',
    trigger: 'schedule',
    started_at: '2026-08-01T03:00:00Z',
    finished_at: '2026-08-01T03:01:12Z',
    duration_s: 72,
    artifact_count: 1204,
    error_summary: null,
    ...overrides,
  };
}

/**
 * The trigger receipt.
 *
 * `sync_run_id` is minted here exactly as the server mints it — into the response
 * only. It matches no row: the real run is written later by the scheduled job, so
 * fetching this id 404s. The fixture reproduces that rather than hiding it, because
 * a page that links the receipt to a detail route is the most likely mistake in
 * this area and the mock should not make it look correct.
 */
export function makeTriggerReceipt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sync_run_id: uuid('receipt'),
    source_id: uuid('source'),
    status: 'queued',
    trigger: 'manual',
    started_at: '2026-08-02T10:15:00Z',
    ...overrides,
  };
}

export function makeSupersededFact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fact_id: uuid('fact'),
    entity_id: uuid('entity'),
    sync_run_id: uuid('run'),
    category: 'api_doc',
    body: 'Superseded by a newer authoritative fact.',
    t_valid_from: '2026-07-01T09:00:00Z',
    t_ingested_at: '2026-07-01T09:00:05Z',
    ...overrides,
  };
}

/** A Pydantic-shaped validation failure: `$.field` paths, plus a form-level item. */
export function makeValidationEnvelope(
  items: Array<{ path: string | null; code?: string; message: string }>,
) {
  return {
    errors: items.map(({ path, code, message }) => ({
      path,
      // Pydantic's error *type*, not a registry error code — `missing`,
      // `string_too_short`. Nothing should switch on it expecting the latter.
      code: code ?? 'missing',
      message,
    })),
  };
}
