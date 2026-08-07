import { describe, expect, it } from 'vitest';

import { termText } from '../termText';

/**
 * The interesting cases are the ones a naive capitalise gets wrong, so those are
 * the tests: the acronyms, the separators, and the leading tier marker.
 */

describe('termText', () => {
  it('reads a single-word token as a term', () => {
    expect(termText('unread')).toBe('Unread');
    expect(termText('all')).toBe('All');
    expect(termText('queued')).toBe('Queued');
  });

  it('sentence-cases a snake_case token rather than title-casing it', () => {
    // Title Case is for names. A value in a filter list is a phrase, and
    // "Release Notes" beside "Docs corpus" is two conventions in one list.
    expect(termText('release_notes')).toBe('Release notes');
    expect(termText('docs_corpus')).toBe('Docs corpus');
  });

  it('capitalises acronyms the API writes in lowercase', () => {
    // `ga` is why the acronym table exists: "Ga" is not a lifecycle stage.
    expect(termText('ga')).toBe('GA');
    expect(termText('openapi')).toBe('OpenAPI');
    expect(termText('markdown_adr_rfc')).toBe('Markdown ADR RFC');
    expect(termText('package_json')).toBe('Package JSON');
  });

  it('lifts a leading tier marker without an entry of its own', () => {
    expect(termText('l1_responder')).toBe('L1 responder');
    expect(termText('l3_engineer')).toBe('L3 engineer');
  });

  it('returns an empty token unchanged, so a placeholder stays a placeholder', () => {
    // The "Any" options carry `''` as their value. Nothing here should turn that
    // into a space or a stray capital.
    expect(termText('')).toBe('');
  });
});
