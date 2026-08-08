import { HttpResponse, http } from 'msw';

import { makeErrorEnvelope } from '../fixtures';

/** Stable ids so component and end-to-end tests can open a known retained run. */
export const ARC_READY_RECEIPT_ID = '11111111-1111-4111-8111-111111111111';
export const ARC_REDACTED_RECEIPT_ID = '22222222-2222-4222-8222-222222222222';

function selected(redacted: boolean) {
  return [
    {
      artifact_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      directive_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      is_mandatory: true,
      was_omitted: false,
      omission_reason: null,
      source_locator: redacted ? null : 'contextplane://directives/change-control',
      source_revision_locator: redacted ? null : 'contextplane://directives/change-control@rev-7',
      content_digest: redacted ? null : 'sha256:4f6d7a',
      audience_redacted: redacted,
    },
    {
      artifact_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      revision_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      directive_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      is_mandatory: false,
      was_omitted: true,
      omission_reason: 'budget_exhausted',
      source_locator: 'contextplane://guidance/deployment-checklist',
      source_revision_locator: 'contextplane://guidance/deployment-checklist@rev-3',
      content_digest: 'sha256:9c31d2',
      audience_redacted: false,
    },
  ];
}

function receipt(receiptId: string, redacted: boolean) {
  return {
    receipt_id: receiptId,
    tenant_id: '00000000-0000-4000-8000-000000000001',
    actor_id: '00000000-0000-4000-8000-000000000002',
    host_id: 'agent-host-web-platform',
    session_id: 'session-context-eval-7',
    manifest_fingerprint: 'sha256:manifest-fingerprint',
    attestation_id: 'attestation-7',
    resolution_status: redacted ? 'degraded' : 'ready',
    selection_engine_version: 'arc-selection-v1',
    registry_build_revision: 'contextplane-2026.08.06',
    canonical_profile_versions: { manifest: 'v1', receipt: 'v1' },
    selection_config_digest: 'sha256:selection-config',
    evaluated_at: '2026-08-06T09:45:00Z',
    freshness_basis: 'evaluated_at',
    blocked_reasons: [],
    degraded_reasons: redacted ? ['source_detail_audience_limited'] : [],
    mandatory_directive_count: 1,
    rendered_content_bytes: 4096,
    budget_limit_bytes: 12288,
    integrity_state: 'intact',
    selected: selected(redacted),
  };
}

function explanation(receiptId: string, redacted: boolean) {
  const base = receipt(receiptId, redacted);
  return {
    receipt_id: receiptId,
    resolution_status: base.resolution_status,
    evaluated_at: base.evaluated_at,
    selection_engine_version: base.selection_engine_version,
    selection_config_digest: base.selection_config_digest,
    blocked_reasons: base.blocked_reasons,
    degraded_reasons: base.degraded_reasons,
    budget: {
      rendered_content_bytes: base.rendered_content_bytes,
      budget_limit_bytes: base.budget_limit_bytes,
    },
    selected: base.selected,
    events: [
      {
        sequence: 1,
        event_type: 'resolution_created',
        event_source: 'selection_engine',
        payload: { status: base.resolution_status },
        created_at: base.evaluated_at,
      },
      {
        sequence: 2,
        event_type: 'directive_omitted',
        event_source: 'budget_enforcer',
        payload: { reason: 'budget_exhausted' },
        created_at: '2026-08-06T09:45:01Z',
      },
    ],
    integrity_state: base.integrity_state,
  };
}

function knownReceipt(receiptId: string) {
  if (receiptId === ARC_READY_RECEIPT_ID) return { redacted: false };
  if (receiptId === ARC_REDACTED_RECEIPT_ID) return { redacted: true };
  return undefined;
}

export const arcHandlers = [
  http.get('*/v1/arc/receipts/:receiptId', ({ params }) => {
    const receiptId = String(params.receiptId);
    const known = knownReceipt(receiptId);
    if (!known) {
      // The real router uses this response for both missing and unauthorized
      // receipts so a caller cannot probe whether a UUID exists.
      return HttpResponse.json(makeErrorEnvelope('not_found', 'receipt not found'), {
        status: 404,
      });
    }
    return HttpResponse.json(receipt(receiptId, known.redacted));
  }),

  http.get('*/v1/arc/receipts/:receiptId/explain', ({ params }) => {
    const receiptId = String(params.receiptId);
    const known = knownReceipt(receiptId);
    if (!known) {
      return HttpResponse.json(makeErrorEnvelope('not_found', 'receipt not found'), {
        status: 404,
      });
    }
    return HttpResponse.json(explanation(receiptId, known.redacted));
  }),
];
