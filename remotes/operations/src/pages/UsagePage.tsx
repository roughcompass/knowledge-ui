import { Button, StackLayout, Text } from '@salt-ds/core';
import {
  WORST_DAILY_P95_CAVEAT,
  WORST_DAILY_P95_LABEL,
  daysWithoutTraffic,
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
  DateRangeControls,
  DateRangeValue,
  ErrorPanel,
  FilterBar,
  Note,
  PageHeader,
  SectionCard,
  SectionHeading,
  StatTile,
  TileGrid,
  UnavailableNotice,
  bytesText,
  periodRange,
  resolveWindow,
  todayAsDay,
  EntityLink,
  type DayRange,
  type WindowSelection,
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

/**
 * The surfaces the tile row stands in for while the summary is in flight.
 *
 * Not invented: the response's `surface` field is a closed enum of exactly these
 * two, so the placeholder row has the count and the labels the real row will have
 * and nothing shifts when the numbers arrive. The figures are zero and never
 * shown — `StatTile` draws bars over the reading while it is loading — and the
 * fields exist only because the tile takes a whole surface.
 *
 * A third surface would have to be added to the API's enum first, which is a
 * vendored-schema change and therefore a code change here too. That is the point:
 * this cannot silently fall out of step the way a hand-drawn wireframe would.
 */
const SURFACE_PLACEHOLDERS: readonly SurfaceSummary[] = (['rest', 'mcp'] as const).map(
  (surface) => ({
    surface,
    calls: 0,
    ok_calls: 0,
    error_calls: 0,
    actor_days: 0,
    distinct_actors: 0,
    payload_bytes: null,
    payload_tokens: null,
    worst_daily_p95_ms: null,
  }),
);

/**
 * The worst daily p95, as a card-sized phrase.
 *
 * Carries `WORST_DAILY_P95_LABEL` verbatim rather than shortening it to "p95",
 * because that is the misreading the API warns about in its own field description:
 * this is the largest single day's percentile, and the window has no p95 at all —
 * percentiles cannot be averaged. The table beside these tiles states the full
 * caveat once for the view.
 *
 * Null is "no timed calls", never `0 ms`. A surface nothing called has no latency
 * to report, and zero would read as an instantaneous one.
 */
function worstDailyP95Phrase(surface: SurfaceSummary): string {
  if (surface.worst_daily_p95_ms === null) return 'no timed calls';
  return `${WORST_DAILY_P95_LABEL} ${surface.worst_daily_p95_ms.toLocaleString()} ms`;
}

/** The tile's line of secondary readings: failures, then the worst daily p95. */
function surfaceTileHint(surface: SurfaceSummary): string {
  return `${surface.error_calls.toLocaleString()} failed · ${worstDailyP95Phrase(surface)}`;
}

/**
 * Distinct actors, at badge size.
 *
 * Three outcomes, same as `ReachCell` below, because collapsing them is what this
 * panel exists to avoid — but the *reason* a count is unavailable does not fit a
 * badge and is not repeated here. It is stated once per view, in the table, which
 * is the rule for a caveat that applies uniformly: an identical marker on every
 * tile and every row becomes chrome the eye stops seeing.
 */
function ReachBadge({ surface }: { surface: SurfaceSummary }) {
  const reach = surfaceReach(surface);

  if (reach.distinctActors === null) {
    return (
      <Text styleAs="notation" color="secondary">
        reach unavailable
      </Text>
    );
  }

  return (
    <Text styleAs="notation" color="secondary">
      {reach.distinctActors.toLocaleString()} {reach.distinctActors === 1 ? 'actor' : 'actors'}
    </Text>
  );
}

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

  /*
   * One window for the whole page, held here because every panel reads it and any
   * of them can change it — the value in each section header opens the same control
   * that sits in the filter row above.
   */
  const [selection, setSelection] = useState<WindowSelection>({
    periodId: '7d',
    custom: { from: '', to: '' },
  });

  /*
   * The last range that was actually applied. While a hand-entered range is
   * incomplete the panels stay on it rather than querying something known to be
   * wrong, which is safe only because every panel reports the window it got.
   */
  const [applied, setApplied] = useState<DayRange>(() => {
    const initial = periodRange('7d', new Date());
    return initial ?? { from: todayAsDay(), to: todayAsDay() };
  });

  const resolved = resolveWindow(selection, applied, new Date());
  const range = resolved.range;
  const customProblem = resolved.problem;

  if (range.from !== applied.from || range.to !== applied.to) {
    // Derived, not an effect: the applied range is a render-time consequence of the
    // selection, and an effect would paint one frame on the previous window.
    setApplied(range);
  }

  const selectWindow = (next: WindowSelection) => {
    /*
     * Switching to a custom range seeds the fields from the window on screen, so the
     * overlay opens on something valid rather than on two empty inputs.
     */
    if (next.periodId === 'custom' && next.custom.from === '' && next.custom.to === '') {
      setSelection({ periodId: 'custom', custom: { ...range } });
      return;
    }
    setSelection(next);
  };

  /**
   * The window a section header shows, and the control behind it.
   *
   * Takes the *response* rather than the request, because each panel is a separate
   * read that may have been answered with a narrower window than was asked for — and
   * a header showing the request while its table shows a rollup is the substitution
   * this page exists to make visible. Before the window moved into the header, every
   * description stated its own panel's range for exactly this reason; passing one
   * shared requested range would have quietly given that up.
   *
   * Falls back to the applied range while a response is in flight, so the header is
   * populated from the first paint rather than appearing once the data lands.
   */
  const windowValue = (response?: { start: string; end: string }) => (
    <DateRangeValue
      range={
        response ? { from: response.start.slice(0, 10), to: response.end.slice(0, 10) } : range
      }
      selection={selection}
      onSelectionChange={selectWindow}
    />
  );

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
          eyebrow="Platform operations"
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
      eyebrow="Platform operations"
      title="Usage"
      description="Whether the contextplane is called, through which surface, and by how many — over a window the service itself reports back."
    />
  );

  /*
   * A row below the header rather than in the header's action slot, which is where
   * this started.
   *
   * `PageHeader` lays its actions out inline with the `h1` and vertically centred,
   * so a control row tall enough to wrap drags the page title down with it — which
   * is what a third field did. It is also the convention already: every other
   * filtered screen in the console renders `FilterBar` as a sibling under the
   * header, and this row governs every panel on the page rather than belonging to
   * any one of them.
   *
   * Rendered here means it is absent from the fully-refused page above, which
   * returns before this point. That is deliberate: the control governs queries
   * that reader cannot make, so offering it would promise something for it to act
   * on. A producer does reach this, and should — the window governs the
   * owned-capability panel too.
   */
  const filters = (
    <FilterBar label="Usage window">
      <DateRangeControls value={selection} onChange={selectWindow} />
    </FilterBar>
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
      {filters}

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

      {/*
        An incomplete custom range is an editing state, not a failure — but the
        panels below are still showing the previous window, and saying which one
        matters more than the fact that a field is blank. Every panel names its own
        window too; this says why it has not changed.
      */}
      {customProblem !== null ? (
        <Note label="Range Not Applied" variant="warning">
          {customProblem} The panels below still cover {applied.from} to {applied.to}.
        </Note>
      ) : null}

      {operatorScoped ? (
        <>
          <StackLayout gap={2}>
            <SectionHeading
              title="By surface"
              description="Calls and reach per surface."
              action={windowValue(summary.data)}
            />
            {summary.error ? (
              <ErrorPanel error={summary.error} title="Could not read usage" />
            ) : null}
            {summary.error === null ? (
              <StackLayout gap={2}>
                <TileGrid>
                  {/*
                    While pending, one placeholder tile per surface the API can
                    return. The vocabulary is closed — the schema declares
                    `Literal["rest", "mcp"]` — so this is the response's own shape
                    rather than a guess at it, and the row does not change count
                    when the data lands. The labels are real for the same reason:
                    which surfaces exist is known before how busy they were.
                  */}
                  {(summary.data?.surfaces ?? SURFACE_PLACEHOLDERS).map((surface) => (
                    <StatTile
                      key={surface.surface}
                      isLoading={summary.isPending}
                      label={surface.surface}
                      value={surface.calls.toLocaleString()}
                      /*
                        Reach qualifies the reading rather than being a second one:
                        the tile says how many calls arrived, and this says how many
                        distinct callers they came from. It sits opposite the label
                        for that reason.
                      */
                      badge={<ReachBadge surface={surface} />}
                      hint={surfaceTileHint(surface)}
                      headingLevel="h3"
                    />
                  ))}
                </TileGrid>

                <DataTable
                  isLoading={summary.isPending}
                  caption="Usage by surface"
                  hideCaption
                  columns={[
                    {
                      key: 'surface',
                      header: 'Surface',
                      render: (row) => <Text>{row.surface}</Text>,
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
                  rows={summary.data?.surfaces ?? []}
                  getRowId={(row) => row.surface}
                  emptyTitle="No Recorded Usage in This Window"
                  emptyDescription="No calls were recorded through any surface. This reads recorded usage, so an empty result means nothing was called — not that nothing is published."
                />

                <Text color="secondary" styleAs="label">
                  {WORST_DAILY_P95_CAVEAT}
                </Text>
              </StackLayout>
            ) : null}
          </StackLayout>

          <SectionCard
            title="Daily volume"
            description="REST calls per day."
            actions={windowValue(series.data)}
          >
            {series.error ? (
              <ErrorPanel error={series.error} title="Could not read the daily series" />
            ) : null}
            {series.error === null ? (
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
                  isLoading={series.isPending}
                  valueLabel="calls"
                  caption="REST calls per day"
                  description="One column per day the service recorded traffic, oldest on the left. Days with no traffic have no column, because the service reports their absence rather than a zero — so the axis is a list of days that had traffic and not a calendar. Column labels thin out to stay readable over a long window; the table below names every day."
                  bars={(series.data?.points ?? []).map((p) => ({
                    label: p.day.slice(5),
                    value: p.calls,
                  }))}
                  rows={series.data?.points ?? []}
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
            description="Which capabilities this tenant's callers looked up."
            actions={windowValue(capabilities.data)}
          >
            {capabilities.error ? (
              <ErrorPanel error={capabilities.error} title="Could not read capability usage" />
            ) : null}
            <DataTable
              isLoading={capabilities.isPending}
              caption="Usage by capability"
              hideCaption
              zebra
              columns={[
                {
                  key: 'capability_id',
                  header: 'Capability',
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
              rows={capabilities.data?.capabilities ?? []}
              getRowId={(row) => row.capability_id}
              emptyTitle="No Capability Lookups in This Window"
              emptyDescription="Nobody asked about a capability by name. This reads what callers looked up, so an empty table is a finding about demand rather than about the catalogue."
            />
          </SectionCard>

          <SectionCard
            title="Tools agents call"
            description="Which tools the agent surface served."
            actions={windowValue(tools.data)}
          >
            {tools.error ? (
              <ErrorPanel error={tools.error} title="Could not read tool usage" />
            ) : null}
            <DataTable
              isLoading={tools.isPending}
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
              rows={tools.data?.tools ?? []}
              getRowId={(row) => row.tool}
              emptyTitle="No Tool Calls in This Window"
              emptyDescription="The agent surface recorded no calls. For a product whose primary consumer is an agent, that is a finding rather than an empty table."
            />
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
          description="How the capabilities you publish are being called."
          actions={windowValue(owned.data)}
        >
          {owned.error ? (
            <ErrorPanel error={owned.error} title="Could not read owned-capability usage" />
          ) : null}
          <DataTable
            isLoading={owned.isPending}
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
            rows={owned.data?.capabilities ?? []}
            getRowId={(row) => row.capability_id}
            emptyTitle="None of Your Capabilities Was Called"
            emptyDescription="This reads usage rather than the catalog, so a capability nobody called is absent rather than listed with zeros. An empty table means no recorded calls in this window, not that you publish nothing."
          />
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
