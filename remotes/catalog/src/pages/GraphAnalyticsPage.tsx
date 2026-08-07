import { Dropdown, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  TRAVERSAL_DEPTHS,
  WORST_DAILY_P95_CAVEAT,
  WORST_DAILY_P95_LABEL,
  describeWindow,
  edgesByRelationship,
  surfaceReach,
  traversalCaveats,
  useCapabilities,
  useDependents,
  useOwnedCapabilityUsage,
  useUsageByCapability,
  useUsageSummary,
  windowSubstituted,
  type RegistryClient,
  type TraversalDepth,
} from '@knowledge-ui/api-client';
import { can, useSession, type Session } from '@knowledge-ui/auth';
import {
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
  popoverOverlayProps,
  termText,
  EntityLink,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * Graph analytics: how far the graph reaches, how much of it is called, and how
 * fast it answers — bounded, everywhere, by what the registry actually serves.
 *
 * ## Breadth and depth are per-root facts, never graph-wide ones
 *
 * "How broad is the graph" and "how deep is the graph" both sound like single
 * numbers, and the registry serves neither. What it serves is a traversal from a
 * *named root* at a *chosen depth*, and that response is complete: unlike the
 * projections it carries no cursor and no truncation flag, so everything within
 * the requested depth is in the array. Counting a complete response is reporting
 * it.
 *
 * So this page asks the question one root at a time and says so in the headings.
 * Breadth is the direct neighbours — a depth-1 traversal, nothing inferred.
 * Depth is reach: the same walk at a greater depth, so a reader can see whether
 * the graph keeps growing or stops. Both are labelled with the root and the
 * direction they were measured from, because a mean branching factor across the
 * whole graph would require paging the whole graph in a browser and would
 * measure this page's fetching rather than the graph.
 *
 * The traversals also report `cache_hit` and per-node version agreement, which
 * are the only correctness caveats the endpoint offers. They are rendered rather
 * than dropped: a cached closure may be missing an edge written a moment ago,
 * and a reader quoting a reach figure needs to know that.
 *
 * ## Usage is reported, never rated
 *
 * Two separate server gates, mirrored separately. The operator scope reports the
 * whole deployment and ranks by `capability_id` only — that ranking carries no
 * name, so none is invented for it. The owner scope reports the capabilities
 * this tenant owns and does carry a name. A session may hold either, both, or
 * neither, and the panels gate independently rather than hiding one behind the
 * other.
 *
 * No rate is computed anywhere. Errors are shown as the count the API sent, next
 * to the total it sent; dividing them here would produce a percentage nobody
 * could reconcile against the service. `actor_days` is never labelled "actors".
 * `worst_daily_p95_ms` is never labelled "p95" on its own, because percentiles
 * cannot be averaged and the API is explicit that this is the largest single
 * day's, not the window's.
 *
 * ## Service objectives are a named absence, not an invented target
 *
 * The obvious fourth panel is an SLO board — targets, attainment, error budget
 * burn. **The registry publishes no objective of any kind.** There is no
 * threshold, target, budget or objective on any schema it serves;
 * `/v1/admin/operational-health` returns readings with a value and a scope and
 * deliberately no target to compare them against. The only other candidate is
 * `/metrics`, which is Prometheus exposition text this console does not parse in
 * a browser.
 *
 * A target picked here would be this page's opinion wearing the service's
 * authority, and the first reader to breach it would escalate against a number
 * nobody agreed. So the measurements are shown without objectives, and the
 * missing objectives are named.
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
 * Breadth and depth, measured from one root.
 *
 * Two traversals: depth one for the direct neighbours, and the chosen depth for
 * reach. At depth one they are the same request, so the second costs nothing —
 * the query cache answers it from the first.
 */
function ReachPanel({ session, client }: { session: Session; client: RegistryClient }) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [depth, setDepth] = useState<TraversalDepth>(2);
  const [root, setRoot] = useState<string | undefined>(undefined);

  /*
   * Roots come from the first page of the catalog, and the copy below says so.
   * Offering a "pick any entity" control would need the whole catalog paged into
   * the browser to populate it, which is the fetch-the-graph-and-count mistake
   * wearing a different hat.
   */
  const roster = useCapabilities(client, scope, { pageSize: 50 });
  const candidates = roster.data?.items ?? [];
  const selected = root ?? candidates[0]?.name;

  const direct = useDependents(client, scope, selected, { depth: 1 });
  const reach = useDependents(client, scope, selected, { depth });

  const control = (
    <FilterBar label="Choose a root and a depth">
      <FilterField label="Root" basis="18rem">
        <Dropdown
          bordered
          value={selected ?? ''}
          onSelectionChange={(_e, chosen) => setRoot(chosen?.[0] ?? undefined)}
          OverlayProps={popoverOverlayProps}
        >
          {candidates.map((item) => (
            <Option key={item.name} value={item.name}>
              {item.name}
            </Option>
          ))}
        </Dropdown>
      </FilterField>
      <FilterField label="Depth" basis="9rem">
        <Dropdown
          bordered
          value={String(depth)}
          onSelectionChange={(_e, chosen) =>
            setDepth((Number(chosen?.[0] ?? 1) as TraversalDepth) ?? 1)
          }
          OverlayProps={popoverOverlayProps}
        >
          {TRAVERSAL_DEPTHS.map((d) => (
            <Option key={d} value={String(d)}>
              {String(d)}
            </Option>
          ))}
        </Dropdown>
      </FilterField>
    </FilterBar>
  );

  if (roster.error) return <ErrorPanel error={roster.error} title="Could not list roots" />;
  if (roster.isPending) return <LoadingPanel label="Loading roots" />;

  if (!selected) {
    return (
      <UnavailableNotice
        title="No entity to measure from"
        reason="Reach is measured by walking outward from a named entity, and the catalog returned none. There is nothing to walk from rather than nothing connected."
      />
    );
  }

  const failed = [direct, reach].find((q) => q.error);
  const caveats = reach.data ? traversalCaveats(reach.data) : [];
  const grouped = edgesByRelationship(reach.data?.edges ?? []);

  return (
    <StackLayout gap={2}>
      {control}

      {failed?.error ? <ErrorPanel error={failed.error} title="Could not walk the graph" /> : null}
      {!failed && (direct.isPending || reach.isPending) ? (
        <LoadingPanel label="Walking the graph" />
      ) : null}

      {!failed && direct.data && reach.data ? (
        <StackLayout gap={2}>
          <TileGrid columns={2}>
            {/*
              "Directly" and "within" are in the labels rather than in a footnote.
              A tile reading "Entities 14" beside a root is read as a property of
              the graph by every reader who does not read the footnote.
            */}
            <StatTile
              label="Entities that depend on it directly"
              value={direct.data.nodes.length}
              hint="A depth-one walk. This is the breadth of this root."
              headingLevel="h3"
            />
            <StatTile
              label={`Entities reached within depth ${depth}`}
              value={reach.data.nodes.length}
              hint={
                reach.data.nodes.length === direct.data.nodes.length
                  ? 'The same set as depth one — the walk stops here.'
                  : 'Everything the walk found, at every depth up to this one.'
              }
              headingLevel="h3"
            />
            <StatTile
              label={`Edges returned at depth ${depth}`}
              value={reach.data.edges.length}
              hint={`Across ${grouped.size} ${grouped.size === 1 ? 'relationship' : 'relationships'}.`}
              headingLevel="h3"
            />
            <StatTile
              label="Served from cache"
              value={reach.data.cache_hit ? 'Yes' : 'No'}
              hint="Whether the closure was recomputed for this request."
              headingLevel="h3"
            />
          </TileGrid>

          <DataTable
            caption={`Edges reaching ${selected}, by relationship`}
            columns={[
              {
                key: 'rel',
                header: 'Relationship',
                render: (row) => <Tag>{termText(row.rel)}</Tag>,
              },
              {
                key: 'count',
                header: 'Edges',
                align: 'right',
                render: (row) => <Text>{row.count.toLocaleString()}</Text>,
              },
            ]}
            rows={[...grouped.entries()].map(([rel, edges]) => ({
              rel,
              count: edges.length,
            }))}
            getRowId={(row) => row.rel}
            emptyTitle="Nothing Depends on This Entity"
            emptyDescription="The walk completed and found no inbound edges within this depth. Nothing points here — which is different from a walk that was cut short, and this one was not."
          />

          {caveats.length > 0 ? (
            <Note label="What this walk could not settle" variant="warning">
              {caveats.join(' ')}
            </Note>
          ) : null}

          <Note label="One root, one direction">
            These figures describe {selected} only, walking inward — the entities that depend on it.
            They are not a breadth or depth for the graph as a whole; the registry serves no such
            figure, and deriving one would mean paging the whole graph into this browser. Roots are
            offered from the first page of the catalog.
          </Note>
        </StackLayout>
      ) : null}
    </StackLayout>
  );
}

/** The deployment-wide usage read, which admits administrators only. */
function OperatorUsagePanel({
  session,
  client,
  range,
}: {
  session: Session;
  client: RegistryClient;
  range: { from: string; to: string };
}) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'usage:read:operator');

  const summary = useUsageSummary(client, scope, range, { enabled: allowed });
  const ranking = useUsageByCapability(client, scope, range, { enabled: allowed });

  if (!allowed) {
    return (
      <UnavailableNotice
        title="Deployment-wide usage"
        reason="The aggregate usage endpoints are served under /v1/admin and admit administrators only. This session holds a different role, so the deployment totals are not readable here rather than shown partial."
      />
    );
  }

  const failed = [summary, ranking].find((q) => q.error);
  if (failed?.error) return <ErrorPanel error={failed.error} title="Could not read usage" />;
  if (summary.isPending || ranking.isPending) return <LoadingPanel label="Reading usage" />;

  const substitution = summary.data ? windowSubstituted(summary.data, range) : null;

  return (
    <StackLayout gap={2}>
      {substitution ? (
        <Note label="Narrowed Window" variant="warning">
          {substitution}
        </Note>
      ) : null}

      <TileGrid>
        {(summary.data?.surfaces ?? []).map((surface) => {
          const reachOf = surfaceReach(surface);
          return (
            <StatTile
              key={surface.surface}
              label={surface.surface}
              value={surface.calls.toLocaleString()}
              hint={
                reachOf.distinctActors === null
                  ? `${surface.error_calls.toLocaleString()} failed. Distinct actors: ${reachOf.unavailableReason ?? 'not available.'}`
                  : `${surface.error_calls.toLocaleString()} failed. ${reachOf.distinctActors.toLocaleString()} distinct actors.`
              }
              headingLevel="h3"
            />
          );
        })}
      </TileGrid>

      <DataTable
        caption={
          ranking.data
            ? `Most-called capabilities, ${describeWindow(ranking.data)}`
            : 'Most-called capabilities'
        }
        columns={[
          {
            key: 'capability_id',
            /*
             * The identifier, because that is the whole of what this response
             * carries. The ranking declares `capability_id`, `calls` and
             * `actor_days` and no name, so a display name here would have to be
             * fetched and matched by this page and could silently mismatch.
             */
            header: 'Capability Id',
            render: (row) => <EntityLink id={row.capability_id} to={`../${row.capability_id}`} />,
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
        rows={ranking.data?.capabilities ?? []}
        getRowId={(row) => row.capability_id}
        emptyTitle="No Capability Was Called in This Window"
        emptyDescription="This reads recorded calls, so an empty result means nothing was consulted — not that nothing is published."
      />

      <Text color="secondary" styleAs="label">
        Actor-days sums each day’s distinct actors, so an actor active on ten days counts ten times.
        It is not a headcount.
      </Text>
    </StackLayout>
  );
}

/** The owner-scoped read: the capabilities this tenant publishes. */
function OwnedUsagePanel({
  session,
  client,
  range,
}: {
  session: Session;
  client: RegistryClient;
  range: { from: string; to: string };
}) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'usage:read:owned');

  const owned = useOwnedCapabilityUsage(client, scope, range, { enabled: allowed });

  if (!allowed) {
    return (
      <UnavailableNotice
        title="Usage of what you publish"
        reason="This read reports the capabilities your tenant owns, and is granted to the roles that publish them. This identity holds no owner scope, so there is nothing it may be shown for."
      />
    );
  }

  if (owned.error) return <ErrorPanel error={owned.error} title="Could not read owned usage" />;
  if (owned.isPending) return <LoadingPanel label="Reading owned usage" />;

  return (
    <StackLayout gap={2}>
      <DataTable
        caption={
          owned.data
            ? `Capabilities you own that were called, ${describeWindow(owned.data)}`
            : 'Capabilities you own that were called'
        }
        columns={[
          { key: 'name', header: 'Capability', render: (row) => <Text>{row.name}</Text> },
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
            key: 'payload_bytes',
            header: 'Bytes Returned',
            align: 'right',
            render: (row) =>
              row.payload_bytes === null ? (
                // Nothing measured the size. MCP and streaming responses record
                // none, so this is unmeasured rather than an empty response.
                <Text color="secondary">Not measured</Text>
              ) : (
                <Text>{row.payload_bytes.toLocaleString()}</Text>
              ),
          },
        ]}
        rows={owned.data?.capabilities ?? []}
        getRowId={(row) => row.capability_id}
        emptyTitle="Nothing You Own Was Called in This Window"
        emptyDescription="A capability nobody called is absent here rather than listed with zeros, because this reads usage rather than the catalog."
      />
    </StackLayout>
  );
}

/** Latency, as the only shape the API serves it in. */
function LatencyPanel({
  session,
  client,
  range,
}: {
  session: Session;
  client: RegistryClient;
  range: { from: string; to: string };
}) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'usage:read:operator');

  const summary = useUsageSummary(client, scope, range, { enabled: allowed });

  if (!allowed) {
    return (
      <UnavailableNotice
        title="Response times"
        reason="Response times are reported by the aggregate usage endpoint, which is served under /v1/admin and admits administrators only."
      />
    );
  }

  if (summary.error) return <ErrorPanel error={summary.error} title="Could not read latency" />;
  if (summary.isPending) return <LoadingPanel label="Reading latency" />;

  return (
    <StackLayout gap={2}>
      <DataTable
        caption="Response time and outcome by surface"
        columns={[
          { key: 'surface', header: 'Surface', render: (row) => <Tag>{row.surface}</Tag> },
          {
            key: 'worst_daily_p95_ms',
            header: WORST_DAILY_P95_LABEL,
            align: 'right',
            render: (row) =>
              row.worst_daily_p95_ms === null ? (
                // No timed calls means no percentile exists. Not zero latency.
                <Text color="secondary">No timed calls</Text>
              ) : (
                <Text>{row.worst_daily_p95_ms.toLocaleString()} ms</Text>
              ),
          },
          {
            key: 'ok_calls',
            header: 'Succeeded',
            align: 'right',
            render: (row) => <Text>{row.ok_calls.toLocaleString()}</Text>,
          },
          {
            key: 'error_calls',
            header: 'Failed',
            align: 'right',
            render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
          },
        ]}
        rows={summary.data?.surfaces ?? []}
        getRowId={(row) => row.surface}
        emptyTitle="No Surface Recorded Traffic"
        emptyDescription="No calls were recorded through any surface in this window, so there is nothing to time."
      />

      <Text color="secondary" styleAs="label">
        {WORST_DAILY_P95_CAVEAT}
      </Text>

      <Note label="Counts, not rates">
        Successes and failures are shown as the counts the service sent. This page does not divide
        them into a failure rate: the two counts are auditable against the service and a percentage
        computed here would not be.
      </Note>
    </StackLayout>
  );
}

export function GraphAnalyticsPage() {
  const { session, client } = useSession<RegistryClient>();

  const [windowId, setWindowId] = useState<WindowId>('7d');
  const selectedWindow = WINDOWS.find((w) => w.id === windowId) ?? WINDOWS[0];
  const range = windowRange(selectedWindow.days, new Date());

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Graph analytics"
        description="How far the graph reaches from a given entity, how much of it is actually called, and how quickly it answers."
        actions={
          <FilterBar label="Usage window">
            <FilterField label="Window" basis="13rem">
              <Dropdown
                bordered
                value={selectedWindow.label}
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

      <SectionCard
        title="Breadth and depth"
        description="Measured by walking inward from one entity. Each walk returns everything within the depth it was asked for, so what is counted here is a complete answer rather than a sample."
      >
        <ReachPanel session={session} client={client} />
      </SectionCard>

      <SectionCard
        title="What is consulted"
        description="Which parts of the graph are actually called, over the window above."
      >
        <OperatorUsagePanel session={session} client={client} range={range} />
      </SectionCard>

      <SectionCard
        title="What you publish"
        description="Usage of the capabilities your own tenant owns, including calls from other tenants."
      >
        <OwnedUsagePanel session={session} client={client} range={range} />
      </SectionCard>

      <SectionCard
        title="Latency"
        description="How quickly each surface answered, in the only form the service reports it."
      >
        <LatencyPanel session={session} client={client} range={range} />
      </SectionCard>

      <UnavailableNotice
        title="Service level objectives"
        // Quiet, for the same reason as the graph totals: nothing here is gated,
        // nothing is coming, and the reader has no move to make. Loud would put
        // it level with the traversal caveats above, which are decisions.
        tone="quiet"
        reason="The registry publishes no objectives. Nothing it serves carries a target, a threshold or an error budget — the operational health endpoint returns readings with a value and a scope and deliberately no target to compare them against, and the Prometheus endpoint is exposition text this console does not parse in a browser. The measurements above are therefore shown without objectives rather than against ones invented here."
        tracking="An objective belongs to whoever is accountable for meeting it. Until the service publishes one, a target on this page would be this console's opinion wearing the service's authority."
      />
    </StackLayout>
  );
}
