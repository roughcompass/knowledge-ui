import { describe, expect, it } from 'vitest';

import { queryKeys } from '../keys';
import {
  CLAIM_PERSONAS,
  DEFAULT_CLAIM_PERSONA,
  confidenceBand,
  recallCaveat,
  uncitedClaims,
  type Claim,
} from '../memory';

/**
 * The trust envelope around a claim, asserted where it can be.
 *
 * These are the pure parts — banding, the recall caveat, the citation invariant
 * and the cache scope. The rendering of them is covered by the screen's own
 * tests; what is checked here is that the rules exist in one place and say what
 * the server says.
 */

const scope = { personaKey: 'consumer', tenantSlug: 'dev' };

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    claim_id: 'c1',
    subject_entity_id: 'e1',
    predicate: 'depends_on',
    value: 'salt-ds',
    claim_category: 'interface',
    confidence: 0.9,
    authority: 'derived',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: null,
    as_of: '2026-08-04T00:00:00Z',
    human_confirmed: false,
    citations: [{ kind: 'session_event', ref: 'ev-1', excerpt: null }],
    label: 'living-memory-recall',
    trust: 'untrusted',
    trust_note: 'Recalled, machine-derived content. Not an operator-authored fact.',
    ...overrides,
  } as Claim;
}

describe('confidence banding', () => {
  it('bands rather than rounds', () => {
    // 0.82 and 0.79 are not meaningfully different, and two decimal places
    // invite a reader to treat them as if they were.
    expect(confidenceBand(0.95)).toBe('high');
    expect(confidenceBand(0.8)).toBe('high');
    expect(confidenceBand(0.79)).toBe('moderate');
    expect(confidenceBand(0.5)).toBe('moderate');
    expect(confidenceBand(0.49)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });

  it('puts the boundaries on the inclusive side of the stronger band', () => {
    // Stated as a test because an off-by-one here silently downgrades every
    // claim sitting exactly on a threshold, which is where seeded data lands.
    expect(confidenceBand(0.8)).toBe(confidenceBand(0.81));
    expect(confidenceBand(0.5)).toBe(confidenceBand(0.51));
  });
});

describe('the recall caveat', () => {
  it('carries the server wording rather than a paraphrase', () => {
    const claims = [makeClaim(), makeClaim({ claim_id: 'c2' })];
    expect(recallCaveat(claims)).toBe(claims[0]!.trust_note);
  });

  it('is absent when there is nothing to caveat', () => {
    // An empty result needs an empty state, not a safety notice about claims
    // that are not on screen.
    expect(recallCaveat([])).toBeNull();
  });

  it('is one caveat for the set, not one per claim', () => {
    /*
     * The load-bearing assertion. Every served claim is labelled untrusted by
     * construction — the server refuses to build one otherwise — so a per-row
     * badge would imply variance that does not exist and would become chrome the
     * eye skips. This returns a single string for the whole set, and that is the
     * design rather than a convenience.
     */
    const many = Array.from({ length: 5 }, (_, i) => makeClaim({ claim_id: `c${i}` }));
    expect(typeof recallCaveat(many)).toBe('string');
    expect(new Set(many.map((c) => c.trust)).size).toBe(1);
  });
});

describe('the citation invariant', () => {
  it('finds nothing when every claim is cited, which is the server guarantee', () => {
    expect(uncitedClaims([makeClaim(), makeClaim({ claim_id: 'c2' })])).toEqual([]);
  });

  it('reports an uncited claim rather than rendering it as evidence', () => {
    /*
     * The server raises rather than serving a claim with no citations, so this
     * should be unreachable. It is checked because the guarantee lives in another
     * repository and a response is a runtime value — the generated types are
     * erased at build time and prove nothing about what arrived.
     */
    const bad = makeClaim({ claim_id: 'uncited', citations: [] });
    expect(uncitedClaims([makeClaim(), bad])).toEqual([bad]);
  });
});

describe('the persona vocabulary', () => {
  it('matches the values the server accepts', () => {
    // The server validates against a closed set and refuses an unknown value, so
    // a shortened spelling here produces a 422 rather than an empty list. This
    // caught `l1`/`l3` before they shipped.
    expect([...CLAIM_PERSONAS]).toEqual(['l1_responder', 'l3_engineer', 'architect', 'agent']);
  });

  it('defaults to the depth the server defaults to', () => {
    expect(CLAIM_PERSONAS).toContain(DEFAULT_CLAIM_PERSONA);
    expect(DEFAULT_CLAIM_PERSONA).toBe('agent');
  });
});

describe('claim cache keys', () => {
  it('stay inside the principal scope', () => {
    /*
     * Matters more here than elsewhere: a claim's visibility is decided per
     * entity, so two principals asking the same question legitimately get
     * different answers. A key that escaped the prefix would serve one tenant's
     * claims to another, which for this surface is the trust boundary itself
     * rather than a stale row.
     */
    for (const key of [
      queryKeys.claims(scope, { predicate: 'depends_on' }),
      queryKeys.claimSearch(scope, { q: 'ledger' }),
      queryKeys.claim(scope, 'c1'),
    ]) {
      expect(key.slice(0, 3)).toEqual(['kui', 'consumer', 'dev']);
    }
  });

  it('separates a filtered list from a ranked search', () => {
    // Different endpoints with different orderings. Sharing a key would show a
    // relevance-ranked result set under a structural filter's heading.
    expect(queryKeys.claims(scope, { q: 'x' })).not.toEqual(
      queryKeys.claimSearch(scope, { q: 'x' }),
    );
  });

  it('keys a claim detail per claim', () => {
    expect(queryKeys.claim(scope, 'a')).not.toEqual(queryKeys.claim(scope, 'b'));
  });
});
