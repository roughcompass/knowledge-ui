import { describe, expect, it, vi } from 'vitest';

import { createRegistryClient } from '../client';
import { queryKeys } from '../keys';
import {
  daysWithoutTraffic,
  describeWindow,
  surfaceReach,
  windowSubstituted,
  type DailySeries,
  type SurfaceSummary,
} from '../usage';

/**
 * The helpers whose only job is to carry the API's own care to the screen.
 *
 * Each corresponds to a decision the service made deliberately and a client
 * destroys by accident, so each is tested on the awkward case rather than the easy
 * one.
 */

const scope = { personaKey: 'admin', tenantSlug: 'dev' };

function surface(overrides: Partial<SurfaceSummary> = {}): SurfaceSummary {
  return {
    surface: 'rest',
    calls: 100,
    ok_calls: 98,
    error_calls: 2,
    actor_days: 40,
    distinct_actors: 7,
    distinct_actors_unavailable_reason: null,
    payload_bytes: 1000,
    payload_tokens: 100,
    worst_daily_p95_ms: 200,
    ...overrides,
  } as SurfaceSummary;
}

function series(days: string[], start: string, end: string): DailySeries {
  return {
    start,
    end,
    points: days.map((day) => ({
      day,
      surface: 'rest',
      calls: 10,
      ok_calls: 10,
      error_calls: 0,
      distinct_actors: 2,
      p50_ms: 10,
      p95_ms: 20,
      p99_ms: 30,
    })),
  } as DailySeries;
}

describe('reach, which has three outcomes and not two', () => {
  it('reports a count when the server could compute one', () => {
    const reach = surfaceReach(surface({ distinct_actors: 7 }));
    expect(reach.distinctActors).toBe(7);
    expect(reach.unavailableReason).toBeNull();
  });

  it('treats a real zero as a count, not as unavailable', () => {
    /*
     * The bug this exists to prevent, and the reason the check is against null
     * rather than falsiness: a surface nobody called has zero distinct actors, and
     * replacing that fact with an apology loses a real finding.
     */
    const reach = surfaceReach(surface({ distinct_actors: 0 }));
    expect(reach.distinctActors).toBe(0);
    expect(reach.unavailableReason).toBeNull();
  });

  it('carries the reason when the count is genuinely unrecoverable', () => {
    // Null means the window reaches past raw retention. The API ships the reason
    // expressly so a caller renders it rather than a zero.
    const reach = surfaceReach(
      surface({
        distinct_actors: null,
        distinct_actors_unavailable_reason: 'past the retention boundary',
      }),
    );
    expect(reach.distinctActors).toBeNull();
    expect(reach.unavailableReason).toBe('past the retention boundary');
  });

  it('keeps actor-days available either way, since it is all there is when the count is not', () => {
    expect(surfaceReach(surface({ distinct_actors: null })).actorDays).toBe(40);
    expect(surfaceReach(surface({ distinct_actors: 7 })).actorDays).toBe(40);
  });
});

describe('days the series did not report', () => {
  it('finds a gap in the middle of a window', () => {
    /*
     * The series omits a day with no traffic rather than sending zero, "so a caller
     * can tell an outage from a quiet weekend". Naming the gap is the alternative to
     * a chart drawing straight through it.
     */
    const gaps = daysWithoutTraffic(
      series(['2026-07-01', '2026-07-02', '2026-07-04'], '2026-07-01', '2026-07-04'),
    );
    expect(gaps).toEqual(['2026-07-03']);
  });

  it('finds a gap at either edge, which a chart of what it was given cannot show', () => {
    expect(daysWithoutTraffic(series(['2026-07-02'], '2026-07-01', '2026-07-03'))).toEqual([
      '2026-07-01',
      '2026-07-03',
    ]);
  });

  it('reports nothing when every day in the window reported', () => {
    expect(
      daysWithoutTraffic(series(['2026-07-01', '2026-07-02'], '2026-07-01', '2026-07-02')),
    ).toEqual([]);
  });

  it('reports the whole window when the series is empty', () => {
    // An entirely quiet window is a fact, and it is not the same as a failed query.
    expect(daysWithoutTraffic(series([], '2026-07-01', '2026-07-03'))).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
  });

  it('counts a day once even when several surfaces reported it', () => {
    // The series is one point per day *per surface*, so a naive set of days would
    // otherwise mistake a multi-surface day for a duplicate.
    const multi = series(['2026-07-01', '2026-07-01'], '2026-07-01', '2026-07-02');
    expect(daysWithoutTraffic(multi)).toEqual(['2026-07-02']);
  });
});

describe('the window a response actually covered', () => {
  it('states the range the response reported', () => {
    expect(describeWindow({ start: '2026-07-01', end: '2026-07-07' })).toBe(
      '2026-07-01 to 2026-07-07',
    );
  });

  it('says nothing when the response covered what was asked for', () => {
    expect(
      windowSubstituted(
        { start: '2026-07-01', end: '2026-07-07' },
        {
          from: '2026-07-01',
          to: '2026-07-07',
        },
      ),
    ).toBeNull();
  });

  it('says so when the rollup did not reach back far enough', () => {
    /*
     * Silently substituting reports a smaller number under the reader's own
     * heading, which is the failure mode of every dashboard that shows a total
     * without the window it belongs to.
     */
    const message = windowSubstituted(
      { start: '2026-06-15', end: '2026-07-07' },
      {
        from: '2026-06-01',
        to: '2026-07-07',
      },
    );
    expect(message).toMatch(/2026-06-15 to 2026-07-07/);
    expect(message).toMatch(/not the window requested/);
  });

  it('says nothing when nothing specific was requested', () => {
    expect(windowSubstituted({ start: '2026-07-01', end: '2026-07-07' }, {})).toBeNull();
  });

  it('does not report a substitution for the same day spelled without zero padding', () => {
    /*
     * The bug this closes. The date was truncated to ten characters rather than
     * parsed, which is a no-op on anything shorter — so `2026-8-4` survived intact,
     * compared unequal to the server's `2026-08-04`, and produced a false "this is
     * not the window you asked for" on the one page whose purpose is not overstating
     * anything.
     */
    expect(
      windowSubstituted(
        { start: '2026-08-04', end: '2026-08-04' },
        { from: '2026-8-4', to: '2026-8-4' },
      ),
    ).toBeNull();
  });

  it('accepts a Date as readily as a string', () => {
    expect(
      windowSubstituted(
        { start: '2026-07-01', end: '2026-07-07' },
        { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-07T23:59:59Z') },
      ),
    ).toBeNull();
  });

  it('refuses a window it cannot express rather than sending it', () => {
    // A caller error, and silently sending something the endpoint will reject turns
    // it into a confusing 422 far from its cause. Matches `toApiTimestamp` beside it.
    expect(() =>
      windowSubstituted({ start: '2026-07-01', end: '2026-07-07' }, { from: 'last Tuesday' }),
    ).toThrow(TypeError);
  });
});

describe('the parameters the window is actually sent as', () => {
  /**
   * Nothing checked these, and the response schema uses `start`/`end` while the query
   * takes `from`/`to` — so renaming one to match the other is a very natural slip
   * that every existing test would have survived, because the request mocks answer
   * the same payload regardless of what they are asked for.
   *
   * The same discipline was added for the impact traversal after a parameter turned
   * out to be wrong on the wire; it belongs here for the same reason.
   */
  it('sends from and to, not start and end', async () => {
    let seen = '';
    vi.stubGlobal('fetch', (url: string) => {
      seen = String(url);
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });

    const client = createRegistryClient({ baseUrl: 'http://x', getToken: () => 't' });
    await client.request('/v1/admin/usage/summary', {
      query: { from: '2026-07-01', to: '2026-07-07' },
    });

    const params = new URL(seen).searchParams;
    expect(params.get('from')).toBe('2026-07-01');
    expect(params.get('to')).toBe('2026-07-07');
    expect(params.get('start')).toBeNull();
    expect(params.get('end')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('usage cache keys', () => {
  it('stay inside the principal scope', () => {
    for (const key of [
      queryKeys.usageSummary(scope),
      queryKeys.usageSeries(scope),
      queryKeys.usageCapabilities(scope),
      queryKeys.usageTools(scope),
      queryKeys.ownedCapabilityUsage(scope),
    ]) {
      expect(key.slice(0, 3)).toEqual(['kui', 'admin', 'dev']);
    }
  });

  it('separates the five reads', () => {
    const keys = [
      queryKeys.usageSummary(scope),
      queryKeys.usageSeries(scope),
      queryKeys.usageCapabilities(scope),
      queryKeys.usageTools(scope),
      queryKeys.ownedCapabilityUsage(scope),
    ].map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(5);
  });

  it('keys on the window, which is the whole identity of the answer', () => {
    // The same panel over two windows is two different numbers. A key omitting it
    // would show last week's total under this week's heading.
    expect(queryKeys.usageSummary(scope, { from: '2026-07-01' })).not.toEqual(
      queryKeys.usageSummary(scope, { from: '2026-06-01' }),
    );
  });

  it('keeps usage out of the admin prefix, so an operator write cannot clear a producer read', () => {
    /*
     * Four of the five endpoints live under the admin path, but the owner-scoped one
     * does not — and a producer holding only that should not lose their cache to an
     * operator write against something unrelated.
     *
     * Asserted on the segment *after* the scope prefix rather than on the key as a
     * whole: the persona in this scope happens to be named `admin`, so a
     * whole-key check passes or fails for the wrong reason. The property is which
     * namespace the key sits under, which is position four.
     */
    for (const key of [queryKeys.ownedCapabilityUsage(scope), queryKeys.usageSummary(scope)]) {
      expect(key[3]).toBe('usage');
      expect(key[3]).not.toBe('admin');
    }
  });
});
