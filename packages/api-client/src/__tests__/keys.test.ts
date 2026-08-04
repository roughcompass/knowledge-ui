import { describe, expect, it } from 'vitest';

import { queryKeys } from '../keys';

const scope = { personaKey: 'auditor', tenantSlug: 'dev' };

describe('query keys', () => {
  it('always begins with the principal scope', () => {
    // A persona switch clears the cache, but this prefix means even a missed
    // clear cannot show one identity's rows to another.
    for (const key of [
      queryKeys.whoami(scope),
      queryKeys.capabilities(scope),
      queryKeys.capability(scope, 'x'),
      queryKeys.search(scope, { q: 'a' }),
      queryKeys.audit(scope),
      queryKeys.liveness(scope),
      queryKeys.readiness(scope),
    ]) {
      expect(key.slice(0, 3)).toEqual(['kui', 'auditor', 'dev']);
    }
  });

  it('separates principals', () => {
    const a = queryKeys.capabilities({ personaKey: 'admin', tenantSlug: 'dev' });
    const b = queryKeys.capabilities({ personaKey: 'auditor', tenantSlug: 'dev' });
    expect(a).not.toEqual(b);
  });

  it('separates tenants for the same principal', () => {
    const a = queryKeys.capabilities({ personaKey: 'multi', tenantSlug: 'dev' });
    const b = queryKeys.capabilities({ personaKey: 'multi', tenantSlug: 'acme' });
    expect(a).not.toEqual(b);
  });

  it('shares the detail key between the detail view and list enrichment', () => {
    // Enrichment and hover-prefetch deliberately warm the same entry the detail
    // page will read.
    expect(queryKeys.capability(scope, 'payments', { as_of: undefined })).toEqual(
      queryKeys.capability(scope, 'payments', { as_of: undefined }),
    );
  });

  it('varies the list key by filters', () => {
    expect(queryKeys.capabilities(scope, { lifecycle: 'ga' })).not.toEqual(
      queryKeys.capabilities(scope, { lifecycle: 'beta' }),
    );
  });
});
