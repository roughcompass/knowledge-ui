import { FlowLayout, StackLayout, Text } from '@salt-ds/core';
import { can, useSession } from '@knowledge-ui/auth';
import {
  describeScope,
  processScopeCaveat,
  useOperationalHealth,
  type OperationalReading,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import {
  DataTable,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  SectionCard,
  StatTile,
  UnavailableNotice,
} from '@knowledge-ui/ui-kit';
/**
 * Operational state, read from the service itself.
 *
 * Two earlier shapes of this page were wrong, and both failures are worth
 * keeping written down because each looked reasonable at the time.
 *
 * It first fetched `/metrics` and parsed the Prometheus exposition in the
 * browser. That exposition is per-process and cumulative since that process
 * started, so behind more than one replica the page rendered whichever pod the
 * load balancer happened to pick while presenting it as the service. Nothing on
 * screen distinguished that from a total, and nothing could.
 *
 * It was then rebuilt around deep links into a dashboard tool. That is worse in
 * a different direction: the tool is optional deployment infrastructure, so the
 * page became a blank set of links wherever it was not installed — a console
 * that only works next to something it does not ship.
 *
 * So the service answers for itself. Every number here arrives with its own
 * provenance, and the page renders that provenance rather than hiding it,
 * because the two kinds of reading look identical once they are on screen and
 * only one of them is true for the whole deployment.
 */

export function MetricsPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  // Gated before the request, not after: this endpoint is admin-only on the
  // server, so asking as anyone else produces a 403 the reader can do nothing
  // about, rendered as an error where an explanation belongs.
  const permitted = can(session, 'ops:operate');
  const query = useOperationalHealth(client, scope, { enabled: permitted });

  const header = (
    <PageHeader
      title="Operational health"
      description="Conditions worth meeting here rather than going looking for."
    />
  );

  if (!permitted) {
    return (
      <StackLayout gap={3}>
        {header}
        <UnavailableNotice
          title="This summary needs the admin role"
          reason="It reports the shared deployment's queue depths and identity data-quality counters rather than anything scoped to one tenant, so the service restricts it to administrators."
          tracking="Health and readiness on the previous page are open to every role."
        />
      </StackLayout>
    );
  }

  if (query.isPending) {
    return (
      <StackLayout gap={3}>
        {header}
        <LoadingPanel label="Reading operational health" />
      </StackLayout>
    );
  }

  if (query.error || query.data === undefined) {
    return (
      <StackLayout gap={3}>
        {header}
        <ErrorPanel error={query.error} title="Could not read operational health" />
      </StackLayout>
    );
  }

  const { queues, data_quality: dataQuality } = query.data;
  const actionable = dataQuality.filter((r) => (r.value ?? 0) > 0);

  /*
   * A per-row provenance column is worth a column only when the rows disagree.
   * Every reading in this table is process-scoped today, so the column repeated
   * one identical sentence four times and wrapped each to three lines — noise
   * that pushes the two columns a reader actually scans off to the right. Stated
   * once below instead, and the column reappears by itself the moment a
   * cluster-scoped reading joins the table.
   */
  const scopesDiffer = new Set(dataQuality.map((r) => r.scope)).size > 1;
  const instances = [...new Set(dataQuality.map((r) => r.instance).filter(Boolean))];

  return (
    <StackLayout gap={3}>
      {header}

      <SectionCard
        title="Queues"
        description="Counted from the database at read time, so these are correct however many replicas are running."
      >
        <FlowLayout gap={2}>
          {queues.map((reading) => (
            <StatTile
              key={reading.key}
              label={reading.label}
              status={(reading.value ?? 0) > 0 && reading.actionable ? 'warning' : undefined}
              value={<Text styleAs="h3">{formatValue(reading.value)}</Text>}
              // The consequence text explains why a *non-zero* value is bad.
              // Shown against a zero it reads as a live problem, so a healthy
              // queue would permanently claim subscribers are missing events.
              hint={
                (reading.value ?? 0) > 0 && reading.actionable
                  ? reading.actionable
                  : describeScope(reading)
              }
            />
          ))}
        </FlowLayout>
      </SectionCard>

      <SectionCard
        title="Identity and entitlement data quality"
        description="Cumulative counters from the replica that answered this request. Any non-zero value is actionable."
      >
        <StackLayout gap={2}>
          {actionable.length > 0 ? (
            <Text>
              {actionable.length === 1
                ? '1 counter is non-zero and needs attention.'
                : `${actionable.length} counters are non-zero and need attention.`}
            </Text>
          ) : null}

          <DataTable
            caption="Data-quality counters"
            columns={[
              { key: 'label', header: 'Condition' },
              {
                key: 'value',
                header: 'Count',
                render: (row: OperationalReading) => <Text>{formatValue(row.value)}</Text>,
              },
              ...(scopesDiffer
                ? [
                    {
                      key: 'scope',
                      header: 'Reading',
                      render: (row: OperationalReading) => (
                        <Text color="secondary">
                          {describeScope(row)}
                          {row.instance ? ` (${row.instance})` : ''}
                        </Text>
                      ),
                    },
                  ]
                : []),
              {
                key: 'actionable',
                header: 'Why it matters',
                render: (row: OperationalReading) => (
                  <Text color="secondary">{row.actionable ?? '—'}</Text>
                ),
              },
            ]}
            rows={dataQuality}
            getRowId={(row: OperationalReading) => row.key}
          />

          <Text styleAs="notation" color="secondary">
            {processScopeCaveat(instances.filter((i): i is string => i !== null))}
          </Text>
        </StackLayout>
      </SectionCard>

      <SectionCard title="Request rate, latency, and error rate">
        <UnavailableNotice
          title="Not available in this console"
          reason="A rate or a percentile is computed over a window, which needs a time-series store. This console reads the service directly and holds no history, so it can show current state and cumulative totals but not a trend."
          tracking="The service records these; querying them is a job for whatever time-series tooling a deployment runs, which this console does not require or assume."
        />
      </SectionCard>
    </StackLayout>
  );
}

function formatValue(value: number | null): string {
  // Null and zero are different facts, and the gap between them matters most
  // here: null means the table could not be read, which is not an empty queue.
  if (value === null) return 'unavailable';
  return value.toLocaleString();
}
