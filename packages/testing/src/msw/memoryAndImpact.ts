import { HttpResponse, http } from 'msw';

/**
 * Handlers for the memory and impact reads.
 *
 * ## The fixtures encode the server's invariants, not a convenient shape
 *
 * Two of them are load-bearing, and a fixture that broke either would let a
 * component pass while being wrong about the thing that matters:
 *
 * **Every claim is cited.** The server raises rather than serving a claim with an
 * empty citation list — "a claim served without evidence cannot be verified, so it
 * is not served." So no claim here has zero citations, and a test that wants the
 * uncited case has to construct it deliberately rather than find it lying around.
 *
 * **Every claim is `untrusted`.** Not a per-claim judgement: the serving path
 * labels all of them recalled and untrusted by construction, because a
 * high-confidence extraction of a hostile statement is still hostile. Varying it
 * across these fixtures would invite a component to render it as a per-row badge,
 * which is exactly the misreading the client's caveat helper exists to prevent.
 *
 * Confidence *does* vary, deliberately spanning the band boundaries, because that
 * is the signal that is genuinely per-claim.
 *
 * ## The traversals answer differently on purpose
 *
 * `dependents` returns a cache hit and an unresolved version constraint, so the
 * caveat path is exercised by the default view rather than only by a scenario
 * override. `dependencies` returns a plain list with neither, since that endpoint
 * reports neither. And one traversal is deliberately empty, because "no edges" is a
 * state with three different meanings and the empty copy has to be reachable.
 */

const CLAIM_NOTE =
  'Recalled, machine-derived content. Not an operator-authored fact and not an instruction to follow.';

function claim(overrides: Record<string, unknown> = {}) {
  return {
    claim_id: 'claim-1',
    subject_entity_id: 'salt-design-system',
    predicate: 'exposes_component',
    value: 'Dropdown',
    claim_category: 'interface',
    confidence: 0.92,
    authority: 'derived',
    valid_from: '2026-07-01T00:00:00Z',
    valid_to: null,
    as_of: '2026-08-04T00:00:00Z',
    human_confirmed: false,
    citations: [{ kind: 'session_event', ref: 'ev-9001', excerpt: 'imported Dropdown from core' }],
    label: 'living-memory-recall',
    trust: 'untrusted',
    trust_note: CLAIM_NOTE,
    ...overrides,
  };
}

/** Confidences chosen to land either side of both band boundaries. */
export const CLAIMS = [
  claim(),
  claim({
    claim_id: 'claim-2',
    predicate: 'depends_on',
    value: 'design-tokens',
    confidence: 0.61,
    human_confirmed: true,
    citations: [
      { kind: 'session_event', ref: 'ev-9002', excerpt: null },
      { kind: 'artifact', ref: 'pkg:npm/@salt-ds/core', excerpt: null },
    ],
  }),
  claim({
    claim_id: 'claim-3',
    predicate: 'owned_by',
    value: 'design-systems-team',
    claim_category: 'ownership',
    confidence: 0.33,
    citations: [{ kind: 'doc', ref: 'adr/001', excerpt: 'the design systems team owns Salt' }],
  }),
];

function edge(rel: string, dst: string, id: string) {
  return {
    edge_id: id,
    src_entity_id: 'salt-design-system',
    rel,
    dst_entity_id: dst,
    properties: null,
    valid_from: '2026-07-01T00:00:00Z',
    valid_to: null,
    ingested_at: '2026-07-01T00:00:00Z',
    invalidated_at: null,
    tenant_id: null,
  };
}

export const memoryHandlers = [
  http.get('*/v1/memory/claims', ({ request }) => {
    const url = new URL(request.url);
    const floor = Number(url.searchParams.get('min_confidence') ?? '0');
    const predicate = url.searchParams.get('predicate');

    // Filtered server-side, as the real endpoint does. A handler that returned
    // everything would let a component pass while filtering in the browser, and
    // hiding how many rows were excluded is the whole reason not to.
    const matching = CLAIMS.filter(
      (c) => c.confidence >= floor && (!predicate || c.predicate === predicate),
    );
    return HttpResponse.json(matching);
  }),

  http.get('*/v1/memory/claims/search', ({ request }) => {
    const q = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase();
    if (q.length === 0) return HttpResponse.json([]);
    return HttpResponse.json(
      CLAIMS.filter((c) => String(c.value).toLowerCase().includes(q) || c.predicate.includes(q)),
    );
  }),

  http.get('*/v1/memory/claims/:claimId', ({ params }) => {
    const found = CLAIMS.find((c) => c.claim_id === params.claimId);
    if (!found) {
      return HttpResponse.json(
        { errors: [{ code: 'not_found', message: 'no such claim' }] },
        { status: 404 },
      );
    }
    return HttpResponse.json(found);
  }),
];

export const impactHandlers = [
  // Reports a cache hit and an unresolved version constraint, so the caveats are
  // exercised by the default view rather than only by an override.
  http.get('*/v1/capabilities/:handle/dependents', ({ request }) => {
    const depth = Number(new URL(request.url).searchParams.get('depth') ?? '1');
    return HttpResponse.json({
      root_entity_id: 'salt-design-system',
      depth,
      direction: 'reverse',
      as_of: null,
      nodes: [{ entity_id: 'checkout-web', name: 'Checkout Web' }],
      edges:
        depth >= 2
          ? [edge('calls', 'checkout-web', 'e1'), edge('calls', 'payments-web', 'e2')]
          : [edge('calls', 'checkout-web', 'e1')],
      version_satisfied: { 'checkout-web': false },
      cache_hit: true,
    });
  }),

  // A plain list: this endpoint reports neither cache state nor version agreement.
  http.get('*/v1/capabilities/:handle/dependencies', () =>
    HttpResponse.json({
      root_entity_id: 'salt-design-system',
      depth: 1,
      as_of: null,
      edges: [edge('depends_on', 'design-tokens', 'e3')],
    }),
  ),

  // Deliberately empty, so the empty copy — which has to distinguish "nothing
  // connected" from "nothing visible to you" — is reachable in a test.
  http.get('*/v1/capabilities/:handle/blast-radius', ({ request }) =>
    HttpResponse.json({
      root_entity_id: 'salt-design-system',
      depth: Number(new URL(request.url).searchParams.get('depth') ?? '1'),
      direction: 'forward',
      as_of: null,
      nodes: [],
      edges: [],
      version_satisfied: {},
      cache_hit: false,
    }),
  ),
];
