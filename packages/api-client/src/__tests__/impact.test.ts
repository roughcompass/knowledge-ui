import { describe, expect, it, vi } from 'vitest';

import { createRegistryClient } from '../client';
import {
  TRAVERSAL_DEPTHS,
  edgesByRelationship,
  traversalCaveats,
  type EdgeRef,
  type Traversal,
} from '../impact';
import { queryKeys } from '../keys';

const scope = { personaKey: 'producer', tenantSlug: 'dev' };

function edge(rel: string, dst: string): EdgeRef {
  return {
    edge_id: `${rel}:${dst}`,
    src_entity_id: 'root',
    rel,
    dst_entity_id: dst,
    properties: null,
  } as EdgeRef;
}

function traversal(overrides: Partial<Traversal> = {}): Traversal {
  return {
    root_entity_id: 'root',
    depth: 2,
    direction: 'reverse',
    as_of: null,
    nodes: [],
    edges: [],
    version_satisfied: {},
    cache_hit: false,
    ...overrides,
  } as Traversal;
}

describe('the shape the API actually declares', () => {
  /**
   * Two parameters were wrong in a way only the wire could show, and both were
   * wrong in the same direction: the client invented a spelling that read better
   * than the one the API documents.
   */
  it('sends edge types as one comma-separated value, not a repeated parameter', async () => {
    /*
     * The document declares `edge_types` as a nullable *string* described as
     * "comma-separated edge_rel vocab values". Passing an array made the client
     * serialise it as `?edge_types=calls&edge_types=deploys`, and a server binding a
     * single string reads only the first — so selecting three relationship types
     * silently filtered on one, with no error and nothing on screen to suggest it.
     */
    let seen = '';
    vi.stubGlobal('fetch', (url: string) => {
      seen = String(url);
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });
    const client = createRegistryClient({ baseUrl: 'http://x', getToken: () => 't' });
    await client.request('/v1/capabilities/a/dependents', {
      query: { edge_types: ['calls', 'deploys'].join(',') },
    });

    const params = new URL(seen).searchParams;
    expect(params.getAll('edge_types')).toEqual(['calls,deploys']);
    expect(params.get('edge_types')).toBe('calls,deploys');
    vi.unstubAllGlobals();
  });

  it('offers the depths the server accepts, and no others', () => {
    // Capped at five server-side. Offering more would be refused; offering fewer
    // hid reach that was available.
    expect([...TRAVERSAL_DEPTHS]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('grouping edges for reading', () => {
  it('groups by relationship so a long list becomes scannable', () => {
    const grouped = edgesByRelationship([
      edge('calls', 'a'),
      edge('deploys', 'b'),
      edge('calls', 'c'),
    ]);
    expect([...grouped.keys()]).toEqual(['calls', 'deploys']);
    expect(grouped.get('calls')?.map((e) => e.dst_entity_id)).toEqual(['a', 'c']);
  });

  it('keeps traversal order rather than sorting', () => {
    /*
     * The server returns edges in traversal order, which is the only ordering
     * information the response carries. Sorting alphabetically would discard it
     * and make a depth-first walk look like an arbitrary set.
     */
    const grouped = edgesByRelationship([edge('zeta', 'a'), edge('alpha', 'b')]);
    expect([...grouped.keys()]).toEqual(['zeta', 'alpha']);
  });

  it('returns nothing to render for an empty traversal', () => {
    expect(edgesByRelationship([]).size).toBe(0);
  });
});

describe('what a traversal admits about itself', () => {
  it('has no caveats when it answered fully and fresh', () => {
    expect(traversalCaveats(traversal())).toEqual([]);
  });

  it('says so when the closure came from cache', () => {
    // A cached closure may be stale against an edge written a moment ago, and the
    // reader deciding whether to ship a breaking change is the one person who
    // must not be told a partial answer is complete.
    const caveats = traversalCaveats(traversal({ cache_hit: true }));
    expect(caveats).toHaveLength(1);
    expect(caveats[0]).toMatch(/cached/i);
  });

  it('counts the version constraints it could not resolve', () => {
    const caveats = traversalCaveats(
      traversal({ version_satisfied: { a: true, b: false, c: false } }),
    );
    expect(caveats).toHaveLength(1);
    expect(caveats[0]).toMatch(/^2 version constraints/);
  });

  it('reads correctly for a single unresolved constraint', () => {
    // Plural agreement, because a caveat that reads "1 version constraints" is a
    // caveat the reader trusts slightly less.
    const caveats = traversalCaveats(traversal({ version_satisfied: { a: false } }));
    expect(caveats[0]).toMatch(/^1 version constraint could/);
  });

  it('reports both when both apply', () => {
    expect(
      traversalCaveats(traversal({ cache_hit: true, version_satisfied: { a: false } })),
    ).toHaveLength(2);
  });
});

describe('impact cache keys', () => {
  it('stay inside the principal scope', () => {
    for (const key of [
      queryKeys.dependencies(scope, 'salt-ds'),
      queryKeys.dependents(scope, 'salt-ds'),
      queryKeys.blastRadius(scope, 'salt-ds'),
    ]) {
      expect(key.slice(0, 3)).toEqual(['kui', 'producer', 'dev']);
    }
  });

  it('separates the three questions asked of the same capability', () => {
    // Dependencies, dependents and blast radius are different endpoints with
    // different shapes. One shared key would render one under another's heading.
    const keys = [
      JSON.stringify(queryKeys.dependencies(scope, 'x')),
      JSON.stringify(queryKeys.dependents(scope, 'x')),
      JSON.stringify(queryKeys.blastRadius(scope, 'x')),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it('keys on the traversal parameters, not just the root', () => {
    /*
     * The bug this prevents: depth, direction, edge types and the as-of instant
     * each change the answer, so a key holding only the root serves a depth-1
     * result under a depth-3 heading — wrong in a way that looks right.
     */
    expect(queryKeys.blastRadius(scope, 'x', { depth: 1 })).not.toEqual(
      queryKeys.blastRadius(scope, 'x', { depth: 3 }),
    );
    expect(queryKeys.blastRadius(scope, 'x', { as_of: '2026-01-01' })).not.toEqual(
      queryKeys.blastRadius(scope, 'x'),
    );
  });
});
