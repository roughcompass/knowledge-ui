import { afterEach, describe, expect, it } from 'vitest';

import { resolveBasename, withBasename } from '../basename';

/**
 * Where the app thinks it is mounted.
 *
 * Worth testing properly because every failure here looks like something else. A
 * wrong basename produces routes that do not resolve, which reads as a router bug;
 * an un-substituted template placeholder produces the same symptom and is a deploy
 * bug. The resolver exists to tell those apart, and until now nothing checked that
 * it did.
 */

afterEach(() => {
  document.head.querySelectorAll('meta[name="app-basename"]').forEach((el) => el.remove());
  delete (globalThis as { __APP_BASENAME__?: string }).__APP_BASENAME__;
});

function setMeta(content: string) {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'app-basename');
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

describe('resolving the basename', () => {
  it('falls back to the root when nothing is set', () => {
    // The ordinary case: served at the domain root, no deploy-time rewriting.
    expect(resolveBasename()).toBe('/');
  });

  it('prefers a meta tag, which a proxy can rewrite in the served HTML', () => {
    setMeta('/knowledge');
    expect(resolveBasename()).toBe('/knowledge');
  });

  it('accepts an injected global for a host that adds a script instead of a tag', () => {
    (globalThis as { __APP_BASENAME__?: string }).__APP_BASENAME__ = '/console';
    expect(resolveBasename()).toBe('/console');
  });

  it('lets the meta tag win over the global, being the more specific source', () => {
    setMeta('/from-meta');
    (globalThis as { __APP_BASENAME__?: string }).__APP_BASENAME__ = '/from-global';
    expect(resolveBasename()).toBe('/from-meta');
  });

  it('treats an un-substituted placeholder as unset', () => {
    /*
     * The load-bearing case. A template that reached production un-rewritten would
     * otherwise route every URL under a literal `/{{APP_BASENAME}}` and nothing
     * would resolve — a deploy failure wearing the costume of a routing bug. This
     * check is why the two are distinguishable.
     */
    setMeta('{{APP_BASENAME}}');
    expect(resolveBasename()).toBe('/');
  });

  it('falls through a placeholder to the global rather than giving up', () => {
    // A half-configured deploy should still land on the next source, not the root.
    setMeta('{{APP_BASENAME}}');
    (globalThis as { __APP_BASENAME__?: string }).__APP_BASENAME__ = '/console';
    expect(resolveBasename()).toBe('/console');
  });

  it('strips trailing slashes, which the router rejects', () => {
    setMeta('/knowledge/');
    expect(resolveBasename()).toBe('/knowledge');
  });

  it('strips several trailing slashes, not just one', () => {
    // A hand-edited deploy value is exactly where this happens.
    setMeta('/knowledge///');
    expect(resolveBasename()).toBe('/knowledge');
  });

  it('spells the root as a single slash rather than the empty string', () => {
    // The one case where a trailing slash is the only valid form, so trimming to
    // empty would produce a basename the router cannot use.
    setMeta('/');
    expect(resolveBasename()).toBe('/');
  });
});

describe('joining a path onto the basename', () => {
  it('leaves a path untouched at the root', () => {
    expect(withBasename('/', '/catalog')).toBe('/catalog');
  });

  it('prefixes a path when mounted under a prefix', () => {
    expect(withBasename('/knowledge', '/catalog')).toBe('/knowledge/catalog');
  });

  it('inserts the separator when the path lacks one', () => {
    // Callers pass both forms, and producing `/knowledgecatalog` from one of them
    // would be a link that 404s rather than an obvious mistake.
    expect(withBasename('/knowledge', 'catalog')).toBe('/knowledge/catalog');
  });

  it('does not double the separator when the path has one', () => {
    expect(withBasename('/knowledge', '/catalog')).not.toContain('//');
  });
});
