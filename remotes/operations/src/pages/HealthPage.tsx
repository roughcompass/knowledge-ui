import { FlowLayout, StackLayout, Text } from '@salt-ds/core';
import { apiBaseUrl, useSession } from '@knowledge-ui/auth';
import { useLiveness, useReadiness } from '@knowledge-ui/api-client';
import { PageHeader, StatTile } from '@knowledge-ui/ui-kit';

import { OperationalSections } from './MetricsPage';

/**
 * Liveness and readiness, polled.
 *
 * Two probes rather than one because they answer different questions and can
 * disagree: liveness says the process is up, readiness says it can reach its
 * database. A service that is live but not ready is the interesting state, and
 * collapsing them into a single indicator hides it.
 *
 * Readiness deliberately goes through a separate code path in the client:
 * `/readyz` returns plain text with no content-type header, so a client that
 * parses by content type has nothing to dispatch on.
 */
export function HealthPage() {
  const { session } = useSession();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const liveness = useLiveness(scope, apiBaseUrl());
  const readiness = useReadiness(scope, apiBaseUrl());

  /*
   * Three states, not two. `data === undefined` was previously read as "checking",
   * which meant a probe that had *failed* — where the query errors and there is no
   * data — reported itself as still in flight, indefinitely. A failed probe is the
   * whole point of a health page, so it now says so.
   */
  const probeStatus = (
    query: { data: unknown; isPending: boolean; error: unknown },
    ok: boolean,
  ): 'success' | 'warning' | 'error' => {
    if (query.isPending) return 'warning';
    if (query.error !== null || query.data === undefined) return 'error';
    return ok ? 'success' : 'error';
  };

  const livenessStatus = probeStatus(liveness, liveness.data?.state === 'ok');
  const readinessStatus = probeStatus(readiness, readiness.data?.state === 'ready');

  return (
    <StackLayout gap={3}>
      <PageHeader title="Health" description="Polled every ten seconds." />

      <FlowLayout gap={2}>
        <StatTile
          label="Liveness"
          status={livenessStatus}
          value={<Text>{describeLiveness(liveness)}</Text>}
          hint="Whether the process answers."
        />
        <StatTile
          label="Readiness"
          status={readinessStatus}
          value={<Text>{describeReadiness(readiness)}</Text>}
          hint="Whether its dependencies answer."
        />
        <StatTile
          label="Round Trip"
          value={
            <Text>
              {liveness.dataUpdatedAt ? new Date(liveness.dataUpdatedAt).toLocaleTimeString() : '—'}
            </Text>
          }
          hint="Last successful probe, from this browser."
        />
      </FlowLayout>

      <OperationalSections />
    </StackLayout>
  );
}

function describeLiveness(query: ReturnType<typeof useLiveness>): string {
  if (query.isPending) return 'checking…';
  if (query.error !== null) return `probe failed: ${describeError(query.error)}`;
  const state = query.data;
  if (!state) return 'no response';
  if (state.state === 'ok') return 'process is up';
  if (state.state === 'degraded') return `degraded: ${state.detail}`;
  return `unreachable: ${state.detail}`;
}

function describeReadiness(query: ReturnType<typeof useReadiness>): string {
  if (query.isPending) return 'checking…';
  if (query.error !== null) return `probe failed: ${describeError(query.error)}`;
  const state = query.data;
  if (!state) return 'no response';
  if (state.state === 'ready') return 'ready to serve';
  if (state.state === 'not-ready') return state.detail;
  if (state.state === 'unreachable') return `unreachable: ${state.detail}`;
  return `unexpected response (HTTP ${state.status})`;
}

/*
 * The probes are unauthenticated and cross-origin, so the usual failure is a
 * network error with no HTTP status at all. `error.message` is what carries the
 * useful part in that case.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
