/**
 * What an operator needs to meet rather than search for: liveness, readiness,
 * and the conditions that are actionable the moment they are non-zero.
 *
 * Also holds the wording for describing a reading, because the wording *is* the
 * safeguard — see the helpers at the bottom. It used to live in a separate module
 * whose name was a near-homograph of two of its neighbours, and splitting a rule
 * from the values it governs is how the two drift apart.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import { queryKeys, type KeyScope } from './keys';
import { probeLiveness, probeReadiness, type Liveness, type Readiness } from './ops';

export function useLiveness(scope: KeyScope, baseUrl = ''): UseQueryResult<Liveness> {
  return useQuery({
    queryKey: queryKeys.liveness(scope),
    queryFn: ({ signal }) => probeLiveness({ baseUrl, signal }),
    refetchInterval: 10_000,
    // The probe resolves rather than throws for an unreachable server, so a
    // retry would only delay showing the reader that it is down.
    retry: false,
  });
}

export function useReadiness(scope: KeyScope, baseUrl = ''): UseQueryResult<Readiness> {
  return useQuery({
    queryKey: queryKeys.readiness(scope),
    queryFn: ({ signal }) => probeReadiness({ baseUrl, signal }),
    refetchInterval: 10_000,
    retry: false,
  });
}

/**
 * One operational reading, with everything needed to read it correctly.
 *
 * `scope` and `kind` are required rather than optional, mirroring the server's
 * response model. They are the difference between a number that is true for the
 * deployment and one that is a single replica's tally since it last restarted,
 * and the two are indistinguishable once rendered.
 */
export interface OperationalReading {
  key: string;
  label: string;
  /** Null when the value could not be read. Deliberately not zero. */
  value: number | null;
  /** `cluster` is counted from the database; `process` is this replica's counter. */
  scope: 'cluster' | 'process';
  /** `gauge` is current state; `counter` is cumulative since process start. */
  kind: 'gauge' | 'counter';
  /** Which replica answered. Set only for process-scoped readings. */
  instance: string | null;
  /** Why a non-zero value matters. Present when it is actionable on sight. */
  actionable: string | null;
}

export interface OperationalHealth {
  observed_at: string;
  queues: OperationalReading[];
  data_quality: OperationalReading[];
}

export function useOperationalHealth(
  client: RegistryClient,
  scope: KeyScope,
  options: { enabled?: boolean } = {},
): UseQueryResult<OperationalHealth> {
  return useQuery({
    queryKey: queryKeys.operationalHealth(scope),
    queryFn: ({ signal }) =>
      client.request<OperationalHealth>('/v1/admin/operational-health', { signal }),
    enabled: options.enabled ?? true,
    refetchInterval: 15_000,
    // Queue depths are current state, so a cached reading is misleading in a
    // way a cached list is not: it reports a backlog that has since moved.
    staleTime: 0,
    retry: 1,
  });
}

/**
 * How to describe a reading, in one place.
 *
 * The rule this enforces: **wherever a cumulative value is displayed, it is
 * labelled cumulative and its reset semantics are stated, and no rate is ever
 * derived client-side from a single observation.**
 *
 * Single-sourced rather than written per page, because the wording *is* the
 * safeguard. A page that phrases it loosely — "since start", or nothing at all —
 * leaves a reader to assume a counter is a current total, and that assumption is
 * invisible until someone quotes the number in a meeting. Two pages describing
 * the same `kind` differently is the same failure arriving slowly.
 *
 * **Why this is a helper and not a lint rule.** No static check can recognise
 * "this number was rendered without its qualifier" — the value and the caption
 * are separate expressions, and a rule strict enough to catch the omission would
 * fire on every legitimate number in the console. So the mechanism is that the
 * qualifier is cheaper to include than to write yourself, and the tests assert
 * the pages include it. Stated plainly here rather than implied, so the next
 * reader knows this is a convention with a helper, not a guarantee.
 *
 * The historical failure worth naming: the page this replaced accumulated a
 * series in component state across refetches and drew it as a trend, which
 * measured how long a tab had been open rather than anything about the service.
 * Deriving a rate from repeated observations of a cumulative counter is the
 * specific thing that must not come back.
 */
export function describeScope(reading: Pick<OperationalReading, 'scope'>): string {
  return reading.scope === 'cluster'
    ? 'Counted across the deployment, now.'
    : 'One replica, since it last restarted.';
}

/**
 * The caveat a section of process-scoped readings needs beneath it.
 *
 * Separate from `describeScope` because it belongs once per section rather than
 * once per row: repeating it against every reading turns the qualifier into
 * chrome the eye skips, which is the state it is meant to prevent.
 */
export function processScopeCaveat(instances: readonly string[]): string {
  const from = instances.length > 0 ? `Read from ${instances.join(', ')}. ` : '';
  return `${from}A request reaches one replica, so a zero here does not prove zero everywhere. These counters reset when a process restarts.`;
}
