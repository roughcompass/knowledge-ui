import { Button, Dropdown, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  WORST_DAILY_P95_CAVEAT,
  WORST_DAILY_P95_LABEL,
  daysWithoutTraffic,
  describeWindow,
  surfaceReach,
  useOwnedCapabilityUsage,
  useUsageByCapability,
  useUsageByTool,
  useUsageSeries,
  useUsageSummary,
  windowSubstituted,
  type RegistryClient,
  type SurfaceSummary,
  useEntityNames,
} from '@knowledge-ui/api-client';
import { can, refusalSuggestion, useSession } from '@knowledge-ui/auth';
import {
  BarFigure,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  StatTile,
  TileGrid,
  UnavailableNotice,
  bytesText,
  popoverOverlayProps,
  EntityLink,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * Whether the contextplane is used, through which surface, and by how many.
 *
 * The question the whole product turns on and the one nothing here could answer:
 * the aggregate API did not exist when these screens were built, so "is any of this
 * used" was unanswerable from the console. It is answerable now, and this page's
 * job is to answer it without overstating anything.
 *
 * ## Almost every decision below is about not undoing the API's care
 *
 * The service is unusually disciplined about its own numbers, and each discipline
 * is one a dashboard destroys by default:
 *
 * **A day with no traffic is absent, not zero** — "so a caller can tell an outage
 * from a quiet weekend". Every charting default fills that gap, which throws away
 * exactly the distinction that was preserved. This page counts the gaps and names
 * them above the chart instead of drawing through them.
 *
 * **Distinct actors can be genuinely unknown**, when the window reaches past raw
 * retention, and the response carries the reason. Zero would report an unused
 * platform; the reason is rendered instead. A surface with a real zero renders the
 * zero, which is why the two cases are distinguished by null rather than by
 * falsiness.
 *
 * **`actor_days` is not a headcount** — an actor active on ten days counts ten
 * times. It is shown, because it is the only reach figure available when the
 * distinct count is not, and it is labelled as day-counts rather than as people.
 *
 * **The worst daily p95 is not the window's p95.** Percentiles cannot be averaged,
 * so the label says which one it is and the caveat says why.
 *
 * ## What is deliberately absent
 *
 * No rates, no percentages of a total this page computed, no trend arrows. Every
 * number here is a count over a window that the response named, and dividing two of
 * them in a browser produces a figure nobody can check.
 *
 * No strength or proxy badges either. The API classifies none of its fields, so a
 * badge would be a claim the response does not make — and the absence of a
 * classification is itself worth stating rather than papering over.
 */

/** Windows the reader can ask for, as day offsets. */
const WINDOWS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
] as const;

type WindowId = (typeof WINDOWS)[number]['id'];

function windowRange(days: number, now: Date): { from: string; to: string } {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * A surface's reach, in whichever form is actually available.
 *
 * Three outcomes and three renderings, because collapsing them is the failure this
 * panel exists to avoid: a count, a real zero, or the API's own reason why the count
 * cannot be recovered.
 */
function ReachCell({ surface }: { surface: SurfaceSummary }) {
  const reach = surfaceReach(surface);

  if (reach.distinctActors === null) {
    return (
      <StackLayout gap={0.5}>
        <Text color="secondary">Not available</Text>
        <Text color="secondary" styleAs="label">
          {reach.unavailableReason ?? 'The API did not say why.'}
        </Text>
      </StackLayout>
    );
  }

  return (
    <StackLayout gap={0.5}>
      <Text>{reach.distinctActors.toLocaleString()}</Text>
      {/*
        Shown beside the count rather than instead of it, and named as day-counts.
        The API is explicit that an actor active on ten days counts ten times here,
        so calling this "actors" would be the specific misreading it warns against.
      */}
      <Text color="secondary" styleAs="label">
        {reach.actorDays.toLocaleString()} actor-days
      </Text>
    </StackLayout>
  );
}

export function UsagePage() {
  const { session, client, hrefForRemote, personas, onSwitchPersona } =
    useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [windowId, setWindowId] = useState<WindowId>('7d');
  const selected = WINDOWS.find((w) => w.id === windowId) ?? WINDOWS[0];

  /*
   * The range is computed once per render from the selected window. It is a plain
   * value rather than state because it is derived: keeping a copy in state is how a
   * window control and the numbers under it drift apart.
   */
  const range = windowRange(selected.days, new Date());

  const operatorScoped = can(session, 'usage:read:operator');
  const ownerScoped = can(session, 'usage:read:owned');

  const summary = useUsageSummary(client, scope, range, { enabled: operatorScoped });
  const series = useUsageSeries(
    client,
    scope,
    { ...range, surface: 'rest' },
    { enabled: operatorScoped },
  );
  const capabilities = useUsageByCapability(client, scope, range, { enabled: operatorScoped });

  /*
    The ranking answers with ids and no names — its own column comment says so — so
    "which capabilities callers asked about" was a list nobody could read. The owned
    view is different: those rows carry a name already, and passing it means this
    never fires for them.
  */
  const capabilityNames = useEntityNames(
    client,
    scope,
    (capabilities.data?.capabilities ?? []).map((row) => row.capability_id),
  );
  const tools = useUsageByTool(client, scope, range, { enabled: operatorScoped });
  const owned = useOwnedCapabilityUsage(client, scope, range, { enabled: ownerScoped });

  /*
   * A reader with neither scope is told so once, rather than meeting four refused
   * panels. Both are checked because they are separate server gates: a producer
   * holds the owner-scoped read and not the operator one, and sees only their own
   * section below.
   *
   * The refused page carries no window control: the dropdown governs queries this
   * session cannot make, and a live control above a refusal implies there is
   * something for it to act on.
   */
  if (!operatorScoped && !ownerScoped) {
    const { grantingRoles, persona } = refusalSuggestion('usage:read:owned', personas);
    return (
      <StackLayout gap={3}>
        <PageHeader
          title="Usage"
          description="Whether the contextplane is called, through which surface, and by how many — over a window the service itself reports back."
        />
        <UnavailableNotice
          title="Usage is not available to this role"
          reason={`Only ${grantingRoles
            .map((role) => `the ${role} role`)
            .join(
              ' or ',
            )} can read usage. The admin role sees the whole deployment; the producer role sees the capabilities its tenant owns.`}
          action={
            persona && onSwitchPersona ? (
              <Button sentiment="accented" onClick={() => onSwitchPersona(persona.key)}>
                Switch to {persona.label}
              </Button>
            ) : undefined
          }
        />
      </StackLayout>
    );
  }

  const header = (
    <PageHeader
      title="Usage"
      description="Whether the contextplane is called, through which surface, and by how many — over a window the service itself reports back."
      actions={
        <FilterBar label="Usage window">
          <FilterField label="Window" basis="13rem">
            <Dropdown
              bordered
              value={selected.label}
              onSelectionChange={(_e, chosen) => setWindowId((chosen?.[0] as WindowId) ?? '7d')}
              OverlayProps={popoverOverlayProps}
            >
              {WINDOWS.map((w) => (
                <Option key={w.id} value={w.id}>
                  {w.label}
                </Option>
              ))}
            </Dropdown>
          </FilterField>
        </FilterBar>
      }
    />
  );

  const substitution = summary.data ? windowSubstituted(summary.data, range) : null;
  const gaps = series.data ? daysWithoutTraffic(series.data) : [];

  // The same suggestion the route guard would compute, so the section-level
  // refusal names the same roles and offers only a persona that would succeed.
  const operatorRefusal = operatorScoped
    ? null
    : refusalSuggestion('usage:read:operator', personas);
  const operatorPersona = operatorRefusal?.persona;

  return (
    <StackLayout gap={3}>
      {header}

      {/*
        The window the response actually covered, not the one requested. They can
        differ when a rollup does not reach back far enough, and substituting
        silently reports a smaller number under the reader's own heading.
      */}
      {substitution ? (
        // A warning rather than neutral context: a narrowed window is a consequence
        // the reader has to acknowledge before quoting anything on the page.
        <Note label="Narrowed Window" variant="warning">
          {substitution}
        </Note>
      ) : null}

      {operatorScoped ? (
        <>
          <SectionCard
            title="By surface"
            description={
              summary.data
                ? `Calls and reach per surface, ${describeWindow(summary.data)}.`
                : undefined
            }
          >
            {summary.isPending ? <LoadingPanel label="Reading usage" /> : null}
            {summary.error ? (
              <ErrorPanel error={summary.error} title="Could not read usage" />
            ) : null}
            {summary.data ? (
              <StackLayout gap={2}>
                <TileGrid>
                  {summary.data.surfaces.map((surface) => (
                    <StatTile
                      key={surface.surface}
                      label={surface.surface}
                      value={surface.calls.toLocaleString()}
                      hint={`${surface.error_calls.toLocaleString()} failed`}
                    />
                  ))}
                </TileGrid>

                <DataTable
                  caption="Usage by surface"
                  hideCaption
                  columns={[
                    {
                      key: 'surface',
                      header: 'Surface',
                      render: (row) => <Tag>{row.surface}</Tag>,
                    },
                    {
                      key: 'calls',
                      header: 'Calls',
                      align: 'right',
                      render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
                    },
                    {
                      key: 'error_calls',
                      header: 'Failed',
                      align: 'right',
                      render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
                    },
                    {
                      key: 'distinct_actors',
                      header: 'Distinct Actors',
                      render: (row) => <ReachCell surface={row} />,
                    },
                    {
                      key: 'worst_daily_p95_ms',
                      header: WORST_DAILY_P95_LABEL,
                      align: 'right',
                      render: (row) =>
                        row.worst_daily_p95_ms === null ? (
                          // No timed calls means no percentile. Not zero latency.
                          <Text color="secondary">No timed calls</Text>
                        ) : (
                          <Text>{row.worst_daily_p95_ms.toLocaleString()} ms</Text>
                        ),
                    },
                  ]}
                  rows={summary.data.surfaces}
                  getRowId={(row) => row.surface}
                  emptyTitle="No Recorded Usage in This Window"
                  emptyDescription="No calls were recorded through any surface. This reads recorded usage, so an empty result means nothing was called — not that nothing is published."
                />

                <Text color="secondary" styleAs="label">
                  {WORST_DAILY_P95_CAVEAT}
                </Text>
              </StackLayout>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Daily volume"
            description={
              series.data ? `REST calls per day, ${describeWindow(series.data)}.` : undefined
            }
          >
            {series.isPending ? <LoadingPanel label="Reading the daily series" /> : null}
            {series.error ? (
              <ErrorPanel error={series.error} title="Could not read the daily series" />
            ) : null}
            {series.data ? (
              <StackLayout gap={2}>
                {/*
                  The gaps, named. The series omits a day with no traffic rather
                  than sending a zero, so a reader can tell an outage from a quiet
                  weekend — and a chart drawn straight through the gap erases the
                  only signal that distinction had.
                */}
                {gaps.length > 0 ? (
                  <Note label="Days Omitted" variant="warning">
                    {gaps.length === 1
                      ? `No traffic was recorded on ${gaps[0]}. The service omits a day rather than reporting zero, so this is a real gap and not a missing measurement.`
                      : `No traffic was recorded on ${gaps.length} days in this window (${gaps.join(', ')}). The service omits a day rather than reporting zero, so these are real gaps and not missing measurements.`}
                  </Note>
                ) : null}

                <BarFigure
                  caption="REST calls per day"
                  description="One bar per day the service recorded traffic. Days with no traffic have no bar, because the service reports their absence rather than a zero."
                  bars={series.data.points.map((p) => ({
                    label: p.day.slice(5),
                    value: p.calls,
                  }))}
                  rows={series.data.points}
                  getRowId={(row) => `${row.day}:${row.surface}`}
                  columns={[
                    { key: 'day', header: 'Day' },
                    {
                      key: 'calls',
                      header: 'Calls',
                      align: 'right',
                      render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
                    },
                    {
                      key: 'error_calls',
                      header: 'Failed',
                      align: 'right',
                      render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
                    },
                    {
                      key: 'distinct_actors',
                      header: 'Actors That Day',
                      align: 'right',
                      // Labelled "that day" because the API is explicit that these
                      // must not be summed across days.
                      render: (row) => <Text>{row.distinct_actors.toLocaleString()}</Text>,
                    },
                    {
                      key: 'p95_ms',
                      header: 'p95',
                      align: 'right',
                      render: (row) =>
                        row.p95_ms === null ? (
                          <Text color="secondary">—</Text>
                        ) : (
                          <Text>{row.p95_ms.toLocaleString()} ms</Text>
                        ),
                    },
                  ]}
                />

                <Text color="secondary" styleAs="label">
                  Each day’s percentile is exact at its own grain. They are not combined into a
                  window figure, because percentiles cannot be averaged.
                </Text>
              </StackLayout>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Capabilities callers asked about"
            description={
              capabilities.data
                ? `Which capabilities this tenant's callers looked up, ${describeWindow(capabilities.data)}.`
                : undefined
            }
          >
            {capabilities.isPending ? <LoadingPanel label="Reading capability usage" /> : null}
            {capabilities.error ? (
              <ErrorPanel error={capabilities.error} title="Could not read capability usage" />
            ) : null}
            {capabilities.data ? (
              <DataTable
                caption="Usage by capability"
                hideCaption
                zebra
                columns={[
                  {
                    key: 'capability_id',
                    header: 'Capability',
                    linked: true,
                    /*
                      The operations remote emitted no links at all, and this column
                      is the one a producer follows most: "which capability is this
                      traffic against". It rendered a bare id. The host supplies the
                      catalog's mount path, so this can be a real anchor rather than
                      a click handler — a remote still does not hard-code where
                      another one lives.
                    */
                    render: (row) => (
                      <EntityLink
                        id={row.capability_id}
                        name={capabilityNames[row.capability_id]}
                        to={hrefForRemote?.('catalog', row.capability_id)}
                      />
                    ),
                  },
                  {
                    key: 'calls',
                    header: 'Calls',
                    align: 'right',
                    render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
                  },
                  {
                    key: 'actor_days',
                    header: 'Actor-Days',
                    align: 'right',
                    render: (row) => <Text>{row.actor_days.toLocaleString()}</Text>,
                  },
                ]}
                rows={capabilities.data.capabilities}
                getRowId={(row) => row.capability_id}
                emptyTitle="No Capability Lookups in This Window"
                emptyDescription="Nobody asked about a capability by name. This reads what callers looked up, so an empty table is a finding about demand rather than about the catalogue."
              />
            ) : null}
          </SectionCard>

          <SectionCard
            title="Tools agents call"
            description={
              tools.data
                ? `Which tools the agent surface served, ${describeWindow(tools.data)}.`
                : undefined
            }
          >
            {tools.isPending ? <LoadingPanel label="Reading tool usage" /> : null}
            {tools.error ? (
              <ErrorPanel error={tools.error} title="Could not read tool usage" />
            ) : null}
            {tools.data ? (
              <DataTable
                caption="Usage by tool"
                hideCaption
                zebra
                columns={[
                  { key: 'tool', header: 'Tool' },
                  {
                    key: 'calls',
                    header: 'Calls',
                    align: 'right',
                    render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
                  },
                  {
                    key: 'error_calls',
                    header: 'Failed',
                    align: 'right',
                    render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
                  },
                  {
                    key: 'actor_days',
                    header: 'Actor-Days',
                    align: 'right',
                    render: (row) => <Text>{row.actor_days.toLocaleString()}</Text>,
                  },
                  {
                    key: 'worst_daily_p95_ms',
                    header: WORST_DAILY_P95_LABEL,
                    align: 'right',
                    render: (row) =>
                      row.worst_daily_p95_ms === null ? (
                        <Text color="secondary">No timed calls</Text>
                      ) : (
                        <Text>{row.worst_daily_p95_ms.toLocaleString()} ms</Text>
                      ),
                  },
                ]}
                rows={tools.data.tools}
                getRowId={(row) => row.tool}
                emptyTitle="No Tool Calls in This Window"
                emptyDescription="The agent surface recorded no calls. For a product whose primary consumer is an agent, that is a finding rather than an empty table."
              />
            ) : null}
          </SectionCard>
        </>
      ) : operatorRefusal ? (
        <UnavailableNotice
          title="Usage across the deployment"
          reason={`Usage of the capabilities your tenant owns is below. Only ${operatorRefusal.grantingRoles
            .map((role) => `the ${role} role`)
            .join(' or ')} can read usage across the whole deployment.`}
          action={
            operatorPersona && onSwitchPersona ? (
              <Button sentiment="accented" onClick={() => onSwitchPersona(operatorPersona.key)}>
                Switch to {operatorPersona.label}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {ownerScoped ? (
        <SectionCard
          title="Capabilities your tenant owns"
          description={
            owned.data
              ? `How the capabilities you publish are being called, ${describeWindow(owned.data)}.`
              : undefined
          }
        >
          {owned.isPending ? <LoadingPanel label="Reading owned-capability usage" /> : null}
          {owned.error ? (
            <ErrorPanel error={owned.error} title="Could not read owned-capability usage" />
          ) : null}
          {owned.data ? (
            <DataTable
              caption="Usage of owned capabilities"
              hideCaption
              columns={[
                { key: 'name', header: 'Capability' },
                {
                  key: 'calls',
                  header: 'Calls',
                  align: 'right',
                  render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
                },
                {
                  key: 'error_calls',
                  header: 'Failed',
                  align: 'right',
                  // A producer's own signal to act on, not the caller's.
                  render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
                },
                {
                  key: 'actor_days',
                  header: 'Actor-Days',
                  align: 'right',
                  render: (row) => <Text>{row.actor_days.toLocaleString()}</Text>,
                },
                {
                  key: 'payload_bytes',
                  header: 'Payload',
                  align: 'right',
                  render: (row) =>
                    row.payload_bytes === null ? (
                      // Null means nothing measured it, which is not zero bytes.
                      <Text color="secondary">Not measured</Text>
                    ) : (
                      // Adaptive units: a fixed megabyte divisor rendered every
                      // real kilobyte-sized payload as a measured zero.
                      <Text>{bytesText(row.payload_bytes) ?? '—'}</Text>
                    ),
                },
              ]}
              rows={owned.data.capabilities}
              getRowId={(row) => row.capability_id}
              emptyTitle="None of Your Capabilities Was Called"
              emptyDescription="This reads usage rather than the catalog, so a capability nobody called is absent rather than listed with zeros. An empty table means no recorded calls in this window, not that you publish nothing."
            />
          ) : null}
        </SectionCard>
      ) : null}

      {/*
        Neutral, not a warning. This is context about what the page deliberately does
        not claim, and dressing it as a problem would train the reader to skip it —
        which is the fate of every caveat that cries wolf.

        Short on purpose. The reasoning — a rate needs a denominator this console
        does not hold, one derived in a browser cannot be checked, and the API
        classifies none of its fields as measured or merely correlated — belongs
        here, not on the screen: the reader needs the fact, not the argument.
      */}
      <Note label="Reading These Numbers">
        Each figure is a count over the window stated beside it. The service reports no rates, so
        none are shown — and it does not say how directly each figure was measured, so none carries
        a badge.
      </Note>
    </StackLayout>
  );
}
