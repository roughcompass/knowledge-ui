import { HttpResponse, http } from 'msw';

import { roleFor } from './role';

/**
 * Handlers for the usage aggregate reads.
 *
 * ## The fixtures reproduce the API's awkward cases, not its easy ones
 *
 * Every one of these is a shape a careless client renders wrongly, and each is here
 * so a component that gets it wrong fails a test rather than shipping:
 *
 * **A missing day.** The series omits a day with no traffic instead of sending a
 * zero, so a reader "can tell an outage from a quiet weekend". The window below
 * spans seven days and returns six, and the gap is in the middle rather than at an
 * edge — an edge gap is invisible to a chart that just plots what it is given.
 *
 * **A null `distinct_actors` with a reason.** One surface reports null because the
 * window reaches past raw retention, and carries the reason the API supplies
 * expressly "so a caller can render the reason rather than a zero". A panel showing
 * `0` there reports an unused platform.
 *
 * **A zero that is real.** A surface can report `distinct_actors: 0` — nobody called
 * it — and that must render as zero, not as unavailable. A client testing truthiness
 * instead of null passes the null case and fails this one, so both need covering.
 *
 * It is covered by a *scenario override* rather than by a third surface here, and
 * that is a correction: an earlier version of this file invented a `webhook` surface
 * to hold the case. The endpoint declares `Literal["rest", "mcp"]` and the vendored
 * schema closes the enum to those two, so a third value is one the API can never
 * emit — exactly the "a fixture must never be richer than the endpoint it stands
 * for" trap this repo's conventions warn about. Nothing caught it: the handler passes
 * a plain object literal to `HttpResponse.json`, so no generic ties it to the schema
 * and the typecheck is clean either way.
 *
 * **`actor_days` far larger than the headcount.** Deliberately many times the
 * distinct count, because that is exactly the ratio the API warns about — an actor
 * active on ten days counts ten times. A panel labelling it "actors" is visibly
 * wrong against these numbers.
 *
 * **A null latency.** `worst_daily_p95_ms` is null on the surface with no timed
 * calls, because a surface without them has no percentile — not a zero one.
 *
 * ## Role gating is real here
 *
 * The four aggregate reads are admin-only and the owner-scoped read admits producer
 * too, so these handlers check the caller's role rather than answering everyone.
 * A mock that served every role would let a component pass while offering an
 * operator screen to a consumer.
 */

/**
 * What the rollup is holding, and therefore the furthest back it can answer.
 *
 * A request reaching past this comes back narrowed, which is the case the page's
 * "Narrowed Window" notice exists for. A request inside it is echoed exactly.
 */
const RETAINED_FROM = '2026-06-01';

/**
 * The window a response reports, derived from the one requested.
 *
 * These handlers used to return a fixed window whatever they were asked, and that
 * made a working feature look broken: the page shows the range each response
 * covered — because a rollup can answer with less than was requested and saying so
 * is the point — so every panel reported the same dates no matter what the reader
 * selected. Changing the filter did change the request, and nothing on screen moved.
 *
 * The API's own contract is that the window is "echoed back by every response",
 * which is what lets a caller render the window it actually got. A fixture that
 * does not echo is not a simpler version of that endpoint, it is a different one —
 * and the difference was invisible until someone tried to use the filter.
 */
function answeredWindow(request: Request): { start: string; end: string } {
  const params = new URL(request.url).searchParams;
  const from = params.get('from') ?? RETAINED_FROM;
  const to = params.get('to') ?? from;
  // Narrowing, not rejection: the caller asked for more history than exists.
  return { start: from < RETAINED_FROM ? RETAINED_FROM : from, end: to };
}

/** Every day in the window, so a series can be generated across whatever was asked. */
function daysIn({ start, end }: { start: string; end: string }): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  // Bounded so a malformed range cannot spin: no window here is a year of days.
  while (cursor <= last && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function refuse(role: string, allowed: readonly string[]) {
  if (allowed.includes(role)) return null;
  return HttpResponse.json(
    {
      errors: [
        {
          code: 'forbidden',
          message: `role ${role} may not read this usage scope`,
        },
      ],
    },
    { status: 403 },
  );
}

export const usageHandlers = [
  http.get('*/v1/admin/usage/summary', ({ request }) => {
    const denied = refuse(roleFor(request), ['admin']);
    if (denied) return denied;

    const window = answeredWindow(request);
    return HttpResponse.json({
      ...window,
      days: daysIn(window).length,
      surfaces: [
        {
          surface: 'rest',
          calls: 4120,
          ok_calls: 4051,
          error_calls: 69,
          // Many times the distinct count, which is the ratio the API warns about.
          actor_days: 96,
          distinct_actors: 14,
          distinct_actors_unavailable_reason: null,
          payload_bytes: 88_400_000,
          payload_tokens: 2_110_000,
          worst_daily_p95_ms: 412,
        },
        {
          surface: 'mcp',
          calls: 9840,
          ok_calls: 9702,
          error_calls: 138,
          actor_days: 210,
          // Null, with the reason — the case a client renders as zero.
          distinct_actors: null,
          distinct_actors_unavailable_reason:
            'The window reaches past the raw-event retention boundary, so a distinct count cannot be recovered from daily totals.',
          payload_bytes: 141_900_000,
          payload_tokens: 6_640_000,
          worst_daily_p95_ms: 1180,
        },
      ],
    });
  }),

  http.get('*/v1/admin/usage/series', ({ request }) => {
    const denied = refuse(roleFor(request), ['admin']);
    if (denied) return denied;

    /*
     * A point per day of the window the response reports, with the fourth day
     * omitted rather than sent as a zero — the distinction the API preserves "so a
     * caller can tell an outage from a quiet weekend", and the one every charting
     * default destroys. Omitted in the middle rather than at an edge, because an
     * edge gap is invisible to a chart that just plots what it is given.
     */
    const window = answeredWindow(request);
    const days = daysIn(window).filter((_day, index) => index !== 3);

    return HttpResponse.json({
      ...window,
      points: days.map((day, i) => ({
        day,
        surface: 'rest',
        calls: 480 + i * 37,
        ok_calls: 470 + i * 37,
        error_calls: 10,
        distinct_actors: 6 + (i % 3),
        p50_ms: 88,
        p95_ms: 300 + i * 12,
        p99_ms: 900,
      })),
    });
  }),

  http.get('*/v1/admin/usage/capabilities', ({ request }) => {
    const denied = refuse(roleFor(request), ['admin']);
    if (denied) return denied;

    return HttpResponse.json({
      ...answeredWindow(request),
      capabilities: [
        { capability_id: 'salt-design-system', calls: 3110, actor_days: 71 },
        { capability_id: 'entitlements-service', calls: 902, actor_days: 40 },
        { capability_id: 'notification-service', calls: 108, actor_days: 9 },
      ],
    });
  }),

  http.get('*/v1/admin/usage/tools', ({ request }) => {
    const denied = refuse(roleFor(request), ['admin']);
    if (denied) return denied;

    return HttpResponse.json({
      ...answeredWindow(request),
      tools: [
        {
          tool: 'search_capabilities',
          calls: 5210,
          ok_calls: 5180,
          error_calls: 30,
          actor_days: 88,
          worst_daily_p95_ms: 640,
        },
        {
          tool: 'resolve_context',
          calls: 3400,
          ok_calls: 3290,
          error_calls: 110,
          actor_days: 74,
          worst_daily_p95_ms: 1180,
        },
        {
          // A tool nobody called, so it has no percentile. Present because the
          // absence of agent traffic on a published tool is a product finding.
          tool: 'raise_capability_request',
          calls: 0,
          ok_calls: 0,
          error_calls: 0,
          actor_days: 0,
          worst_daily_p95_ms: null,
        },
      ],
    });
  }),

  http.get('*/v1/usage/owned-capabilities', ({ request }) => {
    // Producer as well as admin: a producer is entitled to usage of what they own.
    const denied = refuse(roleFor(request), ['admin', 'producer']);
    if (denied) return denied;

    return HttpResponse.json({
      ...answeredWindow(request),
      capabilities: [
        {
          capability_id: 'salt-design-system',
          name: 'Salt Design System',
          calls: 3110,
          ok_calls: 3050,
          error_calls: 60,
          actor_days: 71,
          payload_bytes: 61_200_000,
        },
        {
          capability_id: 'design-tokens',
          name: 'Design Tokens',
          calls: 140,
          ok_calls: 140,
          error_calls: 0,
          actor_days: 12,
          // Null where nothing measured it — MCP and streaming responses.
          payload_bytes: null,
        },
      ],
    });
  }),
];
