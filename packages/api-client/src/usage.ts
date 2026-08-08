/**
 * Usage: whether the contextplane is called, through which surface, and by how many.
 *
 * This is the read behind the observable-loop question — "is any of this used, and
 * by whom" — which nothing in the app could answer before, because the aggregate
 * API did not exist when the operations screens were built.
 *
 * ## The API is unusually careful, and most of this module exists to not undo that
 *
 * Four of its decisions are the kind a client destroys by accident, and each one
 * has a helper below whose only job is to carry it to the screen:
 *
 * **A day with no traffic is absent, not zero.** The series says so in its own
 * description: "so a caller can tell an outage from a quiet weekend". Zero-filling
 * the gaps — which is what every charting library does by default — throws away
 * exactly the distinction that was preserved for us. `daysWithoutTraffic` names the
 * gaps so a panel can report them instead of drawing through them.
 *
 * **`distinct_actors` can be null, and arrives with a reason.** Null means the
 * window reaches past raw retention, so the number is not recoverable from daily
 * counts. The API even ships `distinct_actors_unavailable_reason` "so a caller can
 * render the reason rather than a zero". Rendering zero here would report an empty
 * platform.
 *
 * **`actor_days` is not a headcount** and the API says so: an actor active on ten
 * days counts ten times, and for a month it runs up to thirty times too large.
 * Labelling it "actors" is the specific misreading it warns against.
 *
 * **`worst_daily_p95_ms` is the largest single-day p95, not the window's p95** —
 * "an average of percentiles has no definition". So it is never labelled p95 on its
 * own, and latency over time comes from the daily series, where each percentile is
 * exact at its own grain.
 *
 * ## What this API does not serve, and is therefore not rendered
 *
 * No strength or tier classification on any field. Nothing here badges a number as
 * measured-versus-proxy, because that would be a claim the response does not make.
 * A panel wanting one has to wait for an API that sends one.
 *
 * No rates. Every count is a total over a window, and the window is returned with
 * it. Dividing one by the other in a browser produces a number nobody can check.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';
import { compact } from './params';
import { LIST_OPTIONS } from './queryDefaults';

type Schemas = components['schemas'];

export type UsageSummary = Schemas['UsageSummaryOut'];
export type SurfaceSummary = Schemas['SurfaceSummaryOut'];
export type DailySeries = Schemas['DailySeriesOut'];
export type DailyPoint = Schemas['DailyPointOut'];
export type CapabilityRanking = Schemas['CapabilityRankingOut'];
export type ToolRanking = Schemas['ToolRankingOut'];
export type OwnedCapabilityUsage = Schemas['OwnedCapabilityUsageListOut'];

/**
 * The window a panel is asking about.
 *
 * Sent as dates and echoed back by every response, which is what lets a panel
 * render the window it actually got rather than the one it asked for. Those can
 * differ — a rollup may not cover the whole request — and saying so is the point.
 */
export interface UsageWindow {
  from?: Date | string;
  to?: Date | string;
}

/**
 * A date, as the usage endpoints take it: a calendar day, not an instant.
 *
 * Parsed and re-emitted rather than truncated. The first version sliced the first ten
 * characters off a string, which is a no-op on anything shorter — so `2026-8-4`, the
 * same calendar day spelled without zero padding, passed through unchanged and then
 * compared unequal to the server's `2026-08-04`. That produced a false "this is not
 * the window you asked for" warning on the one page whose whole purpose is not
 * overstating anything, and would have been rejected outright by the endpoint, which
 * binds these as real dates.
 *
 * Throws on an unparseable value, matching `toApiTimestamp` beside it: a window that
 * cannot be expressed is a caller error, and silently sending something the server
 * will refuse turns it into a confusing 422.
 */
function toDay(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`not a valid date: ${String(value)}`);
  }
  return date.toISOString().slice(0, 10);
}

function windowParams(window: UsageWindow) {
  return compact({ from: toDay(window.from), to: toDay(window.to) });
}

/** Call volume, outcomes and reach per surface, over a window. Admin-gated. */
export function useUsageSummary(
  client: RegistryClient,
  scope: KeyScope,
  window: UsageWindow = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<UsageSummary, RegistryError> {
  const params = windowParams(window);
  return useQuery({
    queryKey: queryKeys.usageSummary(scope, params),
    queryFn: ({ signal }) =>
      client.request<UsageSummary>('/v1/admin/usage/summary', { query: params, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

/** Daily volume, outcomes and exact per-day latency percentiles. Admin-gated. */
export function useUsageSeries(
  client: RegistryClient,
  scope: KeyScope,
  window: UsageWindow & { surface?: string } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<DailySeries, RegistryError> {
  const params = compact({ ...windowParams(window), surface: window.surface });
  return useQuery({
    queryKey: queryKeys.usageSeries(scope, params),
    queryFn: ({ signal }) =>
      client.request<DailySeries>('/v1/admin/usage/series', { query: params, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

/** Which capabilities this tenant's callers asked about. Admin-gated. */
export function useUsageByCapability(
  client: RegistryClient,
  scope: KeyScope,
  window: UsageWindow & { limit?: number } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<CapabilityRanking, RegistryError> {
  const params = compact({ ...windowParams(window), limit: window.limit });
  return useQuery({
    queryKey: queryKeys.usageCapabilities(scope, params),
    queryFn: ({ signal }) =>
      client.request<CapabilityRanking>('/v1/admin/usage/capabilities', { query: params, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

/**
 * Which tools agents actually call. Admin-gated.
 *
 * The one panel that answers a question about the vision's primary consumer:
 * agent traffic arrives through this surface, and it has never been visible.
 */
export function useUsageByTool(
  client: RegistryClient,
  scope: KeyScope,
  window: UsageWindow & { limit?: number } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<ToolRanking, RegistryError> {
  const params = compact({ ...windowParams(window), limit: window.limit });
  return useQuery({
    queryKey: queryKeys.usageTools(scope, params),
    queryFn: ({ signal }) =>
      client.request<ToolRanking>('/v1/admin/usage/tools', { query: params, signal }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

/**
 * How the capabilities this tenant *owns* are being called.
 *
 * A separate endpoint with a separate gate — admin or producer, where the four
 * panels above are admin only — because a producer is entitled to usage of what
 * they own and not to the deployment's. Mirrored as its own capability rather than
 * widening one, since a single entry could only be as permissive as its narrowest
 * use.
 */
export function useOwnedCapabilityUsage(
  client: RegistryClient,
  scope: KeyScope,
  window: UsageWindow & { limit?: number } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<OwnedCapabilityUsage, RegistryError> {
  const params = compact({ ...windowParams(window), limit: window.limit });
  return useQuery({
    queryKey: queryKeys.ownedCapabilityUsage(scope, params),
    queryFn: ({ signal }) =>
      client.request<OwnedCapabilityUsage>('/v1/usage/owned-capabilities', {
        query: params,
        signal,
      }),
    enabled: options.enabled ?? true,
    ...LIST_OPTIONS,
  });
}

// -- carrying the API's own caveats to the screen ----------------------------

/**
 * The window a response actually covers, as a sentence.
 *
 * Every usage response echoes its own `start` and `end`, which is the mechanism
 * for noticing that a rollup did not cover what was asked for. A panel rendering a
 * total without the window it belongs to produces a number that survives being
 * screenshotted and pasted somewhere, which is what happens to dashboard numbers.
 */
export function describeWindow(response: { start: string; end: string }): string {
  return `${response.start.slice(0, 10)} to ${response.end.slice(0, 10)}`;
}

/**
 * Whether the window the response covers differs from the one requested.
 *
 * Returns null when they agree or when nothing specific was asked for. A panel
 * that silently substitutes a narrower window reports a smaller number under the
 * reader's own heading.
 */
export function windowSubstituted(
  response: { start: string; end: string },
  requested: UsageWindow,
): string | null {
  const from = toDay(requested.from);
  const to = toDay(requested.to);
  const gotFrom = response.start.slice(0, 10);
  const gotTo = response.end.slice(0, 10);
  if ((from && from !== gotFrom) || (to && to !== gotTo)) {
    return `Showing ${gotFrom} to ${gotTo}, which is not the window requested — the rollup does not cover all of it.`;
  }
  return null;
}

/**
 * The days in a window that the series returned no point for.
 *
 * The series omits a day with no traffic rather than sending a zero, precisely so a
 * reader "can tell an outage from a quiet weekend". Any rendering that fills the
 * gap — a line drawn straight through it, a bar of height zero — discards that.
 *
 * So the gaps are counted and named instead, and a panel reports them as a fact
 * about the data rather than smoothing them into the shape of the chart.
 */
export function daysWithoutTraffic(series: DailySeries): string[] {
  const seen = new Set(series.points.map((point) => point.day.slice(0, 10)));
  const days: string[] = [];
  const cursor = new Date(`${series.start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${series.end.slice(0, 10)}T00:00:00Z`);

  // Bounded by the window the response itself reported, so a malformed range
  // cannot spin here.
  while (cursor <= last) {
    const day = cursor.toISOString().slice(0, 10);
    if (!seen.has(day)) days.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * How to render a surface's reach, honestly.
 *
 * Three distinct outcomes, and collapsing them is the failure this exists to
 * prevent:
 *
 * - a real count of distinct actors across the window;
 * - **null**, with the API's own reason — the window reaches past raw retention, so
 *   the number cannot be recovered from daily counts. Rendering zero here reports an
 *   unused platform;
 * - `actor_days`, which is available either way and is *not* a headcount: an actor
 *   active on ten days counts ten times, so for a month it can be thirty times too
 *   large. It is returned separately and labelled as what it is, never as "actors".
 */
export interface SurfaceReach {
  distinctActors: number | null;
  unavailableReason: string | null;
  actorDays: number;
}

export function surfaceReach(surface: SurfaceSummary): SurfaceReach {
  const distinctActors = surface.distinct_actors ?? null;

  /*
   * Tested against null explicitly, not for falsiness. Zero distinct actors is a
   * real and meaningful count — a surface nobody called — and treating it as
   * unavailable would replace a fact with an apology.
   */
  return {
    distinctActors,
    unavailableReason:
      distinctActors === null ? (surface.distinct_actors_unavailable_reason ?? null) : null,
    actorDays: surface.actor_days,
  };
}

/**
 * The label a worst-daily-p95 must carry.
 *
 * Never "p95" alone. The API is explicit that this is the largest single-day p95 in
 * the window and not the window's p95, because "an average of percentiles has no
 * definition" — so a panel calling it p95 asserts a statistic that does not exist.
 * Latency over time comes from the daily series, where each percentile is exact at
 * its own grain.
 */
export const WORST_DAILY_P95_LABEL = 'Worst Daily p95';
export const WORST_DAILY_P95_CAVEAT =
  'The largest single day’s p95 in this window, not the window’s p95 — percentiles cannot be averaged. For latency over time, read the daily series.';
