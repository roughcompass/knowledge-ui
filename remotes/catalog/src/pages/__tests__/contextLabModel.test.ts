import { afterEach, describe, expect, it } from 'vitest';

import {
  contextCaseStorageKey,
  createSavedContextCase,
  diffSavedContextCase,
  exportedContextCase,
  loadSavedContextCases,
  savedCaseRequest,
  storeSavedContextCases,
} from '../../contextLabModel';

const consumer = { personaKey: 'consumer', tenantSlug: 'dev' };
const producer = { personaKey: 'producer', tenantSlug: 'dev' };

afterEach(() => sessionStorage.clear());

describe('context regression cases', () => {
  it('preserves evaluator ground truth without calculating a score', () => {
    const saved = createSavedContextCase({
      name: 'Salt dependency context',
      request: { source: 'catalog', query: 'Salt dependencies' },
      evaluations: {
        'salt-design-system': 'expected',
        'web-app-shell': 'not_expected',
      },
      missingContext: 'Expected the token package as well.',
      returnedIds: ['salt-design-system', 'web-app-shell'],
      scope: consumer,
      now: new Date('2026-08-06T12:00:00Z'),
    });

    expect(saved.expected_ids).toEqual(['salt-design-system']);
    expect(saved.not_expected_ids).toEqual(['web-app-shell']);
    expect(saved.baseline_returned_ids).toEqual(['salt-design-system', 'web-app-shell']);
    expect(saved.missing_context).toBe('Expected the token package as well.');
    expect(exportedContextCase(saved)).not.toMatch(/precision|recall|score|percentage/i);
  });

  it('reports transparent rerun sets rather than a derived quality metric', () => {
    const saved = createSavedContextCase({
      name: 'Claim context',
      request: { source: 'claims', query: 'dependencies', claimPersona: 'agent' },
      evaluations: { 'claim-1': 'expected', 'claim-2': 'not_expected' },
      missingContext: '',
      returnedIds: ['claim-1', 'claim-2'],
      scope: consumer,
    });

    expect(diffSavedContextCase(saved, ['claim-2', 'claim-3'])).toEqual({
      expected_and_returned: [],
      expected_but_missing: ['claim-1'],
      new_or_unreviewed: ['claim-3'],
    });
    expect(savedCaseRequest(saved)).toEqual({
      source: 'claims',
      query: 'dependencies',
      claimPersona: 'agent',
    });
  });

  it('namespaces storage by tenant and persona', () => {
    const saved = createSavedContextCase({
      name: 'Consumer-only probe',
      request: { source: 'workspaces', query: 'migration' },
      evaluations: {},
      missingContext: '',
      returnedIds: [],
      scope: consumer,
    });

    expect(storeSavedContextCases(consumer, [saved])).toBe(true);
    expect(loadSavedContextCases(consumer)).toHaveLength(1);
    expect(loadSavedContextCases(producer)).toEqual([]);
    expect(contextCaseStorageKey(consumer)).not.toBe(contextCaseStorageKey(producer));
  });

  it('drops malformed or cross-scope records instead of trusting browser storage', () => {
    sessionStorage.setItem(
      contextCaseStorageKey(consumer),
      JSON.stringify([
        { schema_version: 1, case_id: 'broken' },
        {
          ...createSavedContextCase({
            name: 'Wrong scope',
            request: { source: 'catalog', query: 'x' },
            evaluations: {},
            missingContext: '',
            returnedIds: [],
            scope: producer,
          }),
        },
      ]),
    );

    expect(loadSavedContextCases(consumer)).toEqual([]);
  });
});
