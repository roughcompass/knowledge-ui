import { Button, StackLayout, Text } from '@salt-ds/core';
import { can, refusalSuggestion, useSession } from '@knowledge-ui/auth';
import {
  describeScope,
  isSecondsReading,
  processScopeCaveat,
  useOperationalHealth,
  type OperationalReading,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import {
  DataTable,
  ErrorPanel,
  LoadingPanel,
  SectionCard,
  SectionHeading,
  StatTile,
  TileGrid,
  UnavailableNotice,
  countText,
  durationText,
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

/**
 * The admin half of the merged Health page: queue depths and data-quality
 * counters, below the probes every role can see.
 *
 * This was its own route, "Operational Health", beside "Health" in the rail — two
 * nav entries answering one question, split by permission rather than by subject.
 * Gating is a section concern, not a navigation concern: a non-admin now sees the
 * probes and one quiet line saying what more an admin would see, instead of a
 * second destination that mostly refused them.
 */
export function OperationalSections() {
  const { session, client, personas, onSwitchPersona } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  // Gated before the request, not after: this endpoint is admin-only on the
  // server, so asking as anyone else produces a 403 the reader can do nothing
  // about, rendered as an error where an explanation belongs.
  const permitted = can(session, 'ops:operate');
  const query = useOperationalHealth(client, scope, { enabled: permitted });

  if (!permitted) {
    const { grantingRoles, persona } = refusalSuggestion('ops:operate', personas);
    return (
      <UnavailableNotice
        title="Queues and data quality"
        reason={`The probes above are open to every role. Queue depths and data-quality counters are read with ${grantingRoles
          .map((role) => `the ${role} role`)
          .join(' or ')} only.`}
        action={
          persona && onSwitchPersona ? (
            <Button sentiment="accented" onClick={() => onSwitchPersona(persona.key)}>
              Switch to {persona.label}
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (query.isPending) return <LoadingPanel label="Reading operational health" />;

  if (query.error || query.data === undefined) {
    return <ErrorPanel error={query.error} title="Could not read operational health" />;
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

  /*
   * Same rule as the table's provenance column: a qualifier every tile shares
   * belongs to the section, not to each tile. The per-tile hint comes back by
   * itself the moment one queue reading arrives with a different scope.
   */
  const queueScopesDiffer = new Set(queues.map((r) => r.scope)).size > 1;

  return (
    <StackLayout gap={3}>
      <StackLayout gap={2}>
        <SectionHeading
          title="Queues"
          description="Counted across the deployment from the database at read time, so these are correct however many replicas are running."
        />
        <TileGrid>
          {queues.map((reading) => (
            <StatTile
              key={reading.key}
              label={reading.label}
              status={(reading.value ?? 0) > 0 && reading.actionable ? 'warning' : undefined}
              value={<Text styleAs="h3">{formatValue(reading)}</Text>}
              // The consequence text explains why a *non-zero* value is bad.
              // Shown against a zero it reads as a live problem, so a healthy
              // queue would permanently claim subscribers are missing events.
              hint={
                (reading.value ?? 0) > 0 && reading.actionable
                  ? reading.actionable
                  : queueScopesDiffer
                    ? describeScope(reading)
                    : undefined
              }
              headingLevel="h3"
            />
          ))}
        </TileGrid>
      </StackLayout>

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
            emptyTitle="No Data-Quality Counters"
            emptyDescription="The service published no counters in this snapshot. That is an absence of readings, not a reading of zero — a counter with nothing to report is omitted rather than sent at zero."
            columns={[
              { key: 'label', header: 'Condition' },
              {
                key: 'value',
                header: 'Count',
                align: 'right' as const,
                render: (row: OperationalReading) => <Text>{formatValue(row)}</Text>,
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
                header: 'Why It Matters',
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

      {/*
        One line where a whole card holding a notice stood: the absence is real,
        the explanation of exposition formats was not the reader's problem.
      */}
      <Text styleAs="notation" color="secondary">
        This console holds no history, so no rates or trends are shown.
      </Text>
    </StackLayout>
  );
}

function formatValue(reading: Pick<OperationalReading, 'key' | 'value'>): string {
  // Null and zero are different facts, and the gap between them matters most
  // here: null means the table could not be read, which is not an empty queue.
  if (reading.value === null) return 'unavailable';
  /*
   * The key suffix is the only unit the server sends, and the two kinds must
   * not share a rendering: a seconds-valued age shown as a count reads as a
   * hundred and fifty thousand of something.
   */
  const text = isSecondsReading(reading) ? durationText(reading.value) : countText(reading.value);
  return text ?? 'unavailable';
}
