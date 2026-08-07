import type {
  ClaimPersona,
  ContextProbeRequest,
  ContextProbeSource,
  KeyScope,
} from '@knowledge-ui/api-client';

/**
 * Evaluator-authored state for a retrieval snapshot.
 *
 * These labels are deliberately not a score. They are ground-truth annotations
 * supplied by the person running the probe, and the three states preserve the
 * difference between a negative judgement and an item nobody reviewed.
 */
export const EVALUATION_MARKS = ['unreviewed', 'expected', 'not_expected'] as const;
export type EvaluationMark = (typeof EVALUATION_MARKS)[number];

export interface SavedContextCase {
  schema_version: 1;
  case_id: string;
  name: string;
  scope: KeyScope;
  created_at: string;
  source: ContextProbeSource;
  query: string;
  claim_persona?: ClaimPersona;
  expected_ids: string[];
  not_expected_ids: string[];
  missing_context: string;
  baseline_returned_ids: string[];
}

export interface ContextCaseDiff {
  expected_and_returned: string[];
  expected_but_missing: string[];
  new_or_unreviewed: string[];
}

function randomId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `context-case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSavedContextCase({
  name,
  request,
  evaluations,
  missingContext,
  returnedIds,
  scope,
  now = new Date(),
}: {
  name: string;
  request: ContextProbeRequest;
  evaluations: Readonly<Record<string, EvaluationMark>>;
  missingContext: string;
  returnedIds: readonly string[];
  scope: KeyScope;
  now?: Date;
}): SavedContextCase {
  const idsFor = (mark: EvaluationMark) =>
    returnedIds.filter((id) => evaluations[id] === mark).sort();

  return {
    schema_version: 1,
    case_id: randomId(),
    name: name.trim(),
    scope,
    created_at: now.toISOString(),
    source: request.source,
    query: request.query,
    ...(request.claimPersona ? { claim_persona: request.claimPersona } : {}),
    expected_ids: idsFor('expected'),
    not_expected_ids: idsFor('not_expected'),
    missing_context: missingContext.trim(),
    baseline_returned_ids: [...returnedIds].sort(),
  };
}

export function diffSavedContextCase(
  saved: SavedContextCase,
  returnedIds: readonly string[],
): ContextCaseDiff {
  const returned = new Set(returnedIds);
  const expected = new Set(saved.expected_ids);
  const rejected = new Set(saved.not_expected_ids);

  return {
    expected_and_returned: saved.expected_ids.filter((id) => returned.has(id)).sort(),
    expected_but_missing: saved.expected_ids.filter((id) => !returned.has(id)).sort(),
    new_or_unreviewed: returnedIds.filter((id) => !expected.has(id) && !rejected.has(id)).sort(),
  };
}

export function savedCaseRequest(saved: SavedContextCase): ContextProbeRequest {
  return {
    source: saved.source,
    query: saved.query,
    ...(saved.claim_persona ? { claimPersona: saved.claim_persona } : {}),
  };
}

/**
 * Per-tab and per-principal, matching the app's persona experiment boundary.
 * A persona switch can never read another identity's evaluation cases, even if a
 * caller forgets to clear the current component state.
 */
export function contextCaseStorageKey(scope: KeyScope): string {
  return `kui:context-lab:${encodeURIComponent(scope.tenantSlug)}:${encodeURIComponent(
    scope.personaKey,
  )}:cases:v1`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSavedContextCase(value: unknown, scope: KeyScope): value is SavedContextCase {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SavedContextCase>;
  return (
    row.schema_version === 1 &&
    typeof row.case_id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.source === 'string' &&
    (['catalog', 'claims', 'workspaces'] as const).includes(row.source) &&
    typeof row.query === 'string' &&
    typeof row.missing_context === 'string' &&
    isStringArray(row.expected_ids) &&
    isStringArray(row.not_expected_ids) &&
    isStringArray(row.baseline_returned_ids) &&
    row.scope?.tenantSlug === scope.tenantSlug &&
    row.scope.personaKey === scope.personaKey
  );
}

export function loadSavedContextCases(scope: KeyScope): SavedContextCase[] {
  try {
    const raw = globalThis.sessionStorage?.getItem(contextCaseStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => isSavedContextCase(entry, scope));
  } catch {
    return [];
  }
}

export function storeSavedContextCases(
  scope: KeyScope,
  cases: readonly SavedContextCase[],
): boolean {
  try {
    globalThis.sessionStorage?.setItem(contextCaseStorageKey(scope), JSON.stringify(cases));
    return globalThis.sessionStorage !== undefined;
  } catch {
    return false;
  }
}

export function exportedContextCase(saved: SavedContextCase): string {
  return JSON.stringify(saved, null, 2);
}
