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
  useGraphProjection,
  useOwnedCapabilityUsage,
  useUsageByCapability,
  useUsageSummary,
  windowSubstituted,
  type RegistryClient,
  type TraversalDepth,
  useEntityNames,
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
 * fast it answers — bounded, everywhere, by what the contextplane actually serves.
 *
 * ## Breadth and depth are per-root facts, never graph-wide ones
 *
 * "How broad is the graph" and "how deep is the graph" both sound like single
 * numbers, and the contextplane serves neither. What it serves is a traversal from a
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
 * burn. **The contextplane publishes no objective of any kind.** There is no
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

  /*
   * The default root is one the graph actually reaches.
   *
   * It used to be whichever entity the catalog happened to list first, which is
   * creation order and says nothing about connectedness — so the page opened on
   * four zeros and an empty state, and read as broken rather than as a leaf.
   *
   * An edge's destination is the depended-upon side, so a destination this page
   * can name is an entity with at least one dependent. That is the server's own
   * edge list choosing the default, not a ranking computed here: nothing is
   * counted, sorted or scored in the browser, and the first usable answer wins.
   *
   * Names come from the projection's own nodes before the catalog's, because one
   * response is internally consistent and two responses joined by id are only as
   * good as their agreement — the roster is the fallback for a destination that
   * sits beyond the projection's page.
   */
  const projection = useGraphProjection(client, scope, 'provider', { pageSize: 50 });
  const nameById = new Map([
    ...candidates.map((item) => [item.entity_id, item.name] as const),
    ...(projection.data?.nodes ?? []).map((node) => [node.entity_id, node.name] as const),
  ]);
  const connected = (projection.data?.edges ?? [])
    .map((edge) => nameById.get(edge.dst_entity_id))
    .find(Boolean);

  const selected = root ?? connected ?? candidates[0]?.name;

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
  /*
   * Waits for the edge list too, so the panel opens once on its default rather
   * than measuring the catalog's first entry and then visibly re-measuring when
   * the better root arrives. A failed edge list is not fatal — the fallback is
   * the old default, so only `isPending` gates.
   */
  if (roster.isPending || projection.isPending) return <LoadingPanel label="Loading roots" />;

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
          {caveats.length > 0 ? (
            /*
              Above the tiles it qualifies, not after them — a caveat read after
              the number was already quoted arrives too late to change anything.
            */
            <Note label="What this walk could not settle" variant="warning">
              {caveats.join(' ')}
            </Note>
          ) : null}

          <TileGrid columns={2}>
            {/*
              "Directly" and "within" are in the labels rather than in a footnote.
              A tile reading "Entities 14" beside a root is read as a property of
              the graph by every reader who does not read the footnote.
            */}
            <StatTile
              label="Direct Dependents"
              value={direct.data.nodes.length}
              hint={`Depth-one walk from ${selected}.`}
              headingLevel="h3"
            />
            <StatTile
              label={`Reached at Depth ${depth}`}
              value={reach.data.nodes.length}
              hint={
                reach.data.nodes.length === direct.data.nodes.length
                  ? 'No growth beyond depth one.'
                  : `All entities within depth ${depth}.`
              }
              headingLevel="h3"
            />
            <StatTile
              label={`Edges at Depth ${depth}`}
              value={reach.data.edges.length}
              hint={`Across ${grouped.size} ${grouped.size === 1 ? 'relationship' : 'relationships'}.`}
              headingLevel="h3"
            />
            <StatTile
              label="Served From Cache"
              value={reach.data.cache_hit ? 'Yes' : 'No'}
              hint={
                reach.data.cache_hit
                  ? 'May lag edges written moments ago.'
                  : 'Recomputed for this request.'
              }
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
            emptyTitle="No Dependents Found"
            emptyDescription={`Nothing depends on ${selected} within depth ${depth} — try a deeper walk or another root.`}
          />

          {/*
            One quiet line where an essay stood. The full defence of why no
            graph-wide figure exists lives in this file's own docstring — the
            reader needs the scope, not the argument.
          */}
          <Text styleAs="notation" color="secondary">
            Counts describe {selected} only, not the whole graph.
          </Text>
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

  /*
    The ranking answers with ids and no names, so the one table naming what is
    actually used was unreadable. Resolved from the visible page only.
  */
  const names = useEntityNames(
    client,
    scope,
    (ranking.data?.capabilities ?? []).map((row) => row.capability_id),
  );

  if (!allowed) {
    return (
      <UnavailableNotice
        title="Deployment-wide usage"
        reason="Requires the admin role — switch persona in the header."
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
            render: (row) => (
              <EntityLink
                id={row.capability_id}
                name={names[row.capability_id]}
                to={`../${row.capability_id}`}
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
        reason="Shown only to roles that publish capabilities."
      />
    );
  }

  if (owned.error) return <ErrorPanel error={owned.error} title="Could not read owned usage" />;
  /*
    No early return for the pending state: the table's columns are declared here, so
    it can draw its own skeleton and the panel keeps its height while the request is
    in flight. A spinner in its place collapsed the section and then pushed the page
    down by the height of a table when the rows arrived.
  */
  return (
    <StackLayout gap={2}>
      <DataTable
        isLoading={owned.isPending}
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
    return <UnavailableNotice title="Response times" reason="Requires the admin role." />;
  }

  if (summary.error) return <ErrorPanel error={summary.error} title="Could not read latency" />;
  return (
    <StackLayout gap={2}>
      <DataTable
        isLoading={summary.isPending}
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

      <Text styleAs="notation" color="secondary">
        Counts as reported — no rates computed here.
      </Text>
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
      {/*
        The header carries no control, matching every other route. The window
        dropdown used to sit in the actions slot, which claimed page-wide scope —
        but it never governed Reach, only the three usage sections. It now sits
        directly above the first section it actually applies to.
      */}
      <PageHeader
        title="Graph analytics"
        description="Reach, usage, and response times for the capability graph."
      />

      <SectionCard
        title="Reach"
        description="How many entities depend on the chosen root, at each depth."
      >
        <ReachPanel session={session} client={client} />
      </SectionCard>

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

      <SectionCard
        title="Most-called capabilities"
        description="Which parts of the graph are actually called, over the window above."
      >
        <OperatorUsagePanel session={session} client={client} range={range} />
      </SectionCard>

      <SectionCard
        title="Usage of your capabilities"
        description="Calls against what your tenant owns, including from other tenants."
      >
        <OwnedUsagePanel session={session} client={client} range={range} />
      </SectionCard>

      <SectionCard
        title="Response times"
        description="How quickly each surface answered, over the window above."
      >
        <LatencyPanel session={session} client={client} range={range} />
      </SectionCard>

      {/*
        One line where two paragraphs stood. The argument for why this console
        invents no targets is real, and it belongs in the design docs — a reader
        scanning response times needs only the fact.
      */}
      <Text styleAs="notation" color="secondary">
        No targets shown — the contextplane publishes no service objectives.
      </Text>
    </StackLayout>
  );
}
