/**
 * The memory of record: claims, and the trust signals that travel with them.
 *
 * A claim is an ontology-bound `(subject, predicate, value)` triple attached to a
 * real entity — never free prose. What makes it usable to an agent is everything
 * *around* the triple: where it came from, how much to rely on it, when it was
 * true, and whether a human confirmed it.
 *
 * ## Every field of that envelope is served, so none of it is optional to render
 *
 * `confidence` is a number, `authority` names the source's standing, `trust`
 * classifies the claim with `trust_note` explaining the classification in words,
 * `human_confirmed` records owner acceptance, `citations` carry the sources, and
 * `valid_from` / `valid_to` / `as_of` place it in bi-temporal time.
 *
 * The reason to enumerate that here is that dropping any of it is the failure this
 * surface exists to prevent. A claim rendered as a bare subject-predicate-value —
 * with its confidence in a tooltip, or its citations behind a click nobody makes —
 * is indistinguishable from an assertion, and an agent or engineer acting on it
 * cannot tell a 0.4 from a 0.95. So the client returns the whole envelope and the
 * screen renders it; there is no mapping layer here that could quietly drop a
 * field, and a test asserts as much.
 *
 * ## Two reads, and why both exist
 *
 * `useClaims` filters structurally — by subject, predicate, category, namespace,
 * minimum confidence, and an as-of instant. `useClaimSearch` takes a query string
 * and returns ranked hits. They are separate endpoints rather than one with an
 * optional `q`, and keeping them separate here means a filter change never
 * silently becomes a relevance-ranked result set with a different ordering.
 *
 * `persona` is passed through on both. It is a retrieval choice, not a different
 * store — the same claim answered at the depth the asker needs — so it belongs in
 * the query rather than in a second set of endpoints.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';
import { compact, toApiTimestamp } from './params';
import { LIST_OPTIONS } from './queryDefaults';

type Schemas = components['schemas'];

export type Claim = Schemas['ClaimResponse'];
export type Citation = Schemas['CitationResponse'];

/**
 * The depths a claim can be asked for.
 *
 * Mirrors the server's vocabulary exactly, because it validates against a closed
 * set and refuses an unknown value — so a control offering anything else produces
 * a 422 rather than an empty list. Enumerated for the same reason as the
 * subscribable event kinds.
 */
export const CLAIM_PERSONAS = ['l1_responder', 'l3_engineer', 'architect', 'agent'] as const;
export type ClaimPersona = (typeof CLAIM_PERSONAS)[number];

/** The server's default when none is asked for. */
export const DEFAULT_CLAIM_PERSONA: ClaimPersona = 'agent';

export interface ClaimQuery {
  subjectEntityId?: string;
  predicate?: string;
  category?: string;
  namespacePrefix?: string;
  /** Server-side floor. Filtering client-side would hide how many were excluded. */
  minConfidence?: number;
  asOf?: Date | string;
  persona?: ClaimPersona;
  limit?: number;
}

export interface ClaimSearchQuery {
  q: string;
  namespacePrefix?: string;
  category?: string;
  minConfidence?: number;
  persona?: ClaimPersona;
  topK?: number;
}

/**
 * Claims matching a structural filter.
 *
 * Returns a bare array — this endpoint publishes no cursor and no total, so there
 * is no paging to offer and `limit` is the only bound. Rendering a pager here
 * would imply a next page the server never described.
 */
export function useClaims(
  client: RegistryClient,
  scope: KeyScope,
  query: ClaimQuery = {},
  /**
   * Off when the caller is asking a different question.
   *
   * The filtered list and the ranked search are alternatives, and a page cannot
   * call a hook conditionally — so the one not being asked has to be switched off
   * explicitly. Bounding it with `limit: 0` instead would still issue a request,
   * which is a wasted round trip and a misleading entry in the network log.
   */
  options: { enabled?: boolean } = {},
): UseQueryResult<Claim[], RegistryError> {
  const params = compact({
    subject_entity_id: query.subjectEntityId,
    predicate: query.predicate,
    category: query.category,
    namespace_prefix: query.namespacePrefix,
    min_confidence: query.minConfidence,
    as_of: query.asOf ? toApiTimestamp(query.asOf) : undefined,
    persona: query.persona,
    limit: query.limit,
  });

  return useQuery({
    queryKey: queryKeys.claims(scope, params),
    queryFn: ({ signal }) =>
      client.request<Claim[]>('/v1/memory/claims', { query: params, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

/** Ranked claims for a query string. Disabled until there is something to search for. */
export function useClaimSearch(
  client: RegistryClient,
  scope: KeyScope,
  query: ClaimSearchQuery,
): UseQueryResult<Claim[], RegistryError> {
  const params = compact({
    q: query.q,
    namespace_prefix: query.namespacePrefix,
    category: query.category,
    min_confidence: query.minConfidence,
    persona: query.persona,
    top_k: query.topK,
  });

  return useQuery({
    queryKey: queryKeys.claimSearch(scope, params),
    queryFn: ({ signal }) =>
      client.request<Claim[]>('/v1/memory/claims/search', { query: params, signal }),
    // An empty query is not an error and not an empty result — it is a question
    // nobody asked, so nothing is requested until one is.
    enabled: query.q.trim().length > 0,
    ...LIST_OPTIONS,
  });
}

/** One claim in full, for the citation drill-in. */
export function useClaim(
  client: RegistryClient,
  scope: KeyScope,
  claimId: string | undefined,
): UseQueryResult<Claim, RegistryError> {
  return useQuery({
    queryKey: queryKeys.claim(scope, claimId ?? ''),
    queryFn: ({ signal }) =>
      client.request<Claim>(`/v1/memory/claims/${encodeURIComponent(claimId as string)}`, {
        signal,
      }),
    enabled: Boolean(claimId),
  });
}

/**
 * How much of a claim's confidence to show, as a band rather than a bare number.
 *
 * A number alone invites false precision: 0.82 and 0.79 are not meaningfully
 * different, and a reader who sees two decimal places will treat them as if they
 * were. The band is what carries the decision — and the number is still rendered
 * beside it, because hiding it would be the opposite failure.
 *
 * Thresholds are the client's own reading and are not asserted by the server, so
 * they are stated here in one place rather than inlined at each call site where
 * they would drift.
 */
export type ConfidenceBand = 'high' | 'moderate' | 'low';

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'moderate';
  return 'low';
}

/**
 * The caveat a *set* of served claims needs, once.
 *
 * Read the server before rendering `trust` as a per-claim badge: every claim
 * leaving the serving path is labelled `living-memory-recall` and `untrusted`, by
 * construction, with an assertion that refuses to serve one otherwise. The
 * reasoning is in the server's own words — "a high-confidence extraction of a
 * hostile statement is still hostile" — so this is a **content-trust boundary,
 * not a data-quality score**. It does not vary, and it says nothing about whether
 * a particular claim is accurate.
 *
 * That makes a per-row trust badge actively misleading twice over: it implies
 * variance that does not exist, and repeating an identical marker on every row
 * turns it into chrome the eye learns to skip — which is the state a safety
 * caveat must not reach. So it renders once per view, and `trust_note` carries
 * the server's own wording rather than a paraphrase.
 *
 * The part that matters most for an agent-facing surface is the second half of
 * that note: recalled content is not an instruction to follow. A screen that
 * presents these as authoritative facts has removed the only marker saying they
 * are not.
 */
export function recallCaveat(claims: readonly Claim[]): string | null {
  const note = claims[0]?.trust_note;
  if (claims.length === 0 || !note) return null;

  /*
   * The uniformity is checked, not assumed.
   *
   * Its neighbour below re-verifies the citation invariant for a stated reason —
   * the guarantee lives in another repository and a response is a runtime value —
   * and this function was trusting an invariant of exactly the same kind without
   * the same check. If a claim were ever served through a path carrying a stronger
   * caveat, showing the first note for the whole set would present a warning that
   * is stale for part of it, on the one surface whose purpose is not doing that.
   *
   * Returning null rather than a guess: a caveat that might not apply to what is on
   * screen is worse than the empty-state path, which at least renders nothing
   * misleading.
   */
  return claims.every((claim) => claim.trust_note === note) ? note : null;
}

/**
 * Claims that arrived without citations, which should always be none.
 *
 * The server refuses to construct a served claim with an empty citation list —
 * "a claim served without evidence cannot be verified, so it is not served" — so
 * this is an invariant rather than a state to design a fallback for. It is
 * checked anyway, because the guarantee lives in a different repository and a
 * response is a runtime value: generated types are erased at build time and prove
 * nothing about what actually arrived.
 *
 * A non-empty result is a defect somewhere, and the screen says so rather than
 * rendering an uncitable claim as though it were evidence.
 */
export function uncitedClaims(claims: readonly Claim[]): Claim[] {
  return claims.filter((claim) => claim.citations.length === 0);
}
