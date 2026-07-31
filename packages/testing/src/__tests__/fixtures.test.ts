import { describe, expect, it } from 'vitest';

import { LIFECYCLE, makeCapabilityDetail, makeEntityRef, makeTenantRequired } from '../fixtures';

/**
 * Tests for the fixtures themselves.
 *
 * Unusual, but these are the shapes every other test is written against. A
 * fixture that drifts richer than the API produces code that only fails against
 * the real server, so the drift is worth a gate.
 */

describe('makeEntityRef — the list item shape', () => {
  it('has exactly the fields the list endpoint returns', () => {
    expect(Object.keys(makeEntityRef()).sort()).toEqual([
      'created_at',
      'entity_id',
      'entity_type',
      'external_id',
      'is_active',
      'name',
      'tenant_id',
    ]);
  });

  it('carries NO lifecycle', () => {
    // The reason the list screen filters by lifecycle instead of showing a
    // column: the value simply is not in the response. A fixture that supplied
    // one would make the column look implementable.
    expect(makeEntityRef()).not.toHaveProperty('lifecycle');
  });

  it('carries no attributes or facts either', () => {
    expect(makeEntityRef()).not.toHaveProperty('attributes');
    expect(makeEntityRef()).not.toHaveProperty('facts');
  });
});

describe('makeCapabilityDetail', () => {
  it('does carry lifecycle, from the real vocabulary', () => {
    const detail = makeCapabilityDetail();
    expect(LIFECYCLE).toContain(detail.lifecycle);
  });

  it('uses the real vocabulary, not draft/active', () => {
    // The sibling app's fixtures use `active` and `draft`, which do not exist.
    expect(LIFECYCLE).toEqual(['alpha', 'beta', 'ga', 'deprecated', 'retired']);
    expect(LIFECYCLE as readonly string[]).not.toContain('active');
    expect(LIFECYCLE as readonly string[]).not.toContain('draft');
  });
});

describe('makeTenantRequired', () => {
  it('puts available_tenants inside the error item, not at the root', () => {
    // Where the server actually puts it. A fixture with it at the root would let
    // a broken reader pass its tests.
    const envelope = makeTenantRequired(['dev', 'acme']);
    expect(envelope).not.toHaveProperty('available_tenants');
    expect(envelope.errors[0]).toHaveProperty('available_tenants', ['dev', 'acme']);
  });
});
