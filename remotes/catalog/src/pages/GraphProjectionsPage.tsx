import { StackLayout, Text } from '@salt-ds/core';
import {
  CursorStack,
  filterSignature,
  useGraphProjection,
  type EntityRef,
  type GraphEdge,
  type ProjectionDirection,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  CursorPager,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  UnavailableNotice,
  instantText,
  popoverOverlayProps,
  termText,
  type Column,
  KLink,
} from '@knowledge-ui/ui-kit';
import { Dropdown, Option } from '@salt-ds/core';
import { useMemo, useRef, useState } from 'react';

/**
 * The graph projections, paged.
 *
 * Provider is what this tenant ships; consumer is what it depends on. They are
 * two endpoints rather than one direction parameter, which is why the control
 * below switches endpoints rather than filtering a shared result.
 *
 * ## An edge may point outside its page
 *
 * The response carries the nodes of the current page and the edges belonging to
 * them — so an edge's target is frequently a node on a later page, or one this
 * projection does not contain at all. The edge table therefore shows entity ids
 * for endpoints it cannot resolve, and says so, rather than hiding the edge or
 * printing a blank. An unresolvable target is a real feature of the data, not a
 * gap in the fetch.
 *
 * ## No total, so no "page 3 of 9"
 *
 * `next_cursor` says whether more follows and nothing else. The pager reports
 * what is on screen and offers a next step; it cannot say how far the sequence
 * runs, and inventing a length from the pages already seen would be a number
 * about this session rather than about the graph.
 */

const DIRECTION_LABEL: Record<ProjectionDirection, string> = {
  provider: 'Shipped by this tenant',
  consumer: 'Consumed by this tenant',
};

export function GraphProjectionsPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'graph:read');

  const [direction, setDirection] = useState<ProjectionDirection>('provider');

  // A cursor addresses a position in one endpoint's sequence and means nothing
  // in the other's, so switching direction drops it — the same rule every paged
  // list in this app follows when its filter changes.
  const signature = filterSignature({ direction });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const query = useGraphProjection(client, scope, direction, { cursor }, { enabled: allowed });

  const nodes = useMemo(() => query.data?.nodes ?? [], [query.data]);
  const edges = query.data?.edges ?? [];

  /** Entity ids present on this page, so the edge table can say which it resolved. */
  const nameById = useMemo(
    () => new Map(nodes.map((node) => [node.entity_id, node.name])),
    [nodes],
  );

  const nodeColumns: Column<EntityRef>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <KLink underline="never" color="primary" to={`../${row.name}`}>
          {row.name}
        </KLink>
      ),
    },
    { key: 'entity_type', header: 'Type', render: (row) => termText(row.entity_type) },
    {
      key: 'external_id',
      header: 'External id',
      // Absent rather than empty: not every entity is mapped into an upstream
      // system, and a blank cell reads as a missing value rather than a real one.
      render: (row) => row.external_id ?? <Text color="secondary">Not mapped</Text>,
    },
    {
      key: 'is_active',
      header: 'Active',
      render: (row) => (row.is_active === false ? 'No' : 'Yes'),
    },
    { key: 'created_at', header: 'Created', render: (row) => instantText(row.created_at) },
  ];

  const edgeColumns: Column<GraphEdge>[] = [
    {
      key: 'src',
      header: 'From',
      render: (row) => nameById.get(row.src_entity_id) ?? row.src_entity_id,
    },
    { key: 'rel', header: 'Relation', render: (row) => termText(row.rel) },
    {
      key: 'dst',
      header: 'To',
      render: (row) =>
        nameById.get(row.dst_entity_id) ?? (
          // The id, plainly, plus why it is an id. The alternative — omitting the
          // edge — would make the page under-report the connections it was given.
          <Text color="secondary" title="Not on this page of the projection">
            {row.dst_entity_id}
          </Text>
        ),
    },
    {
      key: 'properties',
      header: 'Properties',
      render: (row) => {
        const entries = Object.entries(row.properties ?? {});
        if (entries.length === 0) return <Text color="secondary">None</Text>;
        return entries.map(([key, value]) => `${termText(key)}: ${String(value)}`).join(', ');
      },
    },
  ];

  if (!allowed) {
    return (
      <StackLayout gap={3}>
        <PageHeader title="Projections" />
        <UnavailableNotice
          title="Projections"
          reason="This session holds no capability to read the graph projections."
        />
      </StackLayout>
    );
  }

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Projections"
        description="What this tenant ships, and what it depends on. Two endpoints, paged by cursor."
      />

      <FilterBar label="Choose a projection">
        <FilterField label="Projection" basis="18rem">
          <Dropdown
            bordered
            value={DIRECTION_LABEL[direction]}
            onSelectionChange={(_event, selected) => {
              const next = selected?.[0];
              if (next) setDirection(next as ProjectionDirection);
            }}
            OverlayProps={popoverOverlayProps}
          >
            {(Object.keys(DIRECTION_LABEL) as ProjectionDirection[]).map((value) => (
              <Option key={value} value={value}>
                {DIRECTION_LABEL[value]}
              </Option>
            ))}
          </Dropdown>
        </FilterField>
      </FilterBar>

      {query.error ? <ErrorPanel error={query.error} /> : null}
      {query.isLoading ? <LoadingPanel label="Loading the projection" /> : null}

      {query.data ? (
        <>
          <SectionCard
            title="Entities"
            description={DIRECTION_LABEL[direction]}
            footer={
              <CursorPager
                canPrev={stack.current.canGoBack}
                canNext={Boolean(query.data.next_cursor)}
                onPrev={() => setCursor(stack.current.pop())}
                onNext={() => {
                  stack.current.push(cursor);
                  setCursor(query.data?.next_cursor ?? null);
                }}
                showingCount={nodes.length}
                isLoading={query.isFetching}
              />
            }
          >
            <DataTable
              columns={nodeColumns}
              rows={nodes}
              getRowId={(row) => row.entity_id}
              caption="Entities in this projection"
              hideCaption
            />
          </SectionCard>

          <SectionCard
            title="Edges"
            description="The edges belonging to the entities above. An edge may point at an entity on a later page, which is shown as its id."
          >
            <StackLayout gap={2}>
              <DataTable
                columns={edgeColumns}
                rows={edges}
                getRowId={(row) => row.edge_id}
                caption="Edges in this projection"
                hideCaption
              />
              <Note label="Why there is no count of the whole projection">
                The response says whether another page follows and nothing more. It carries no
                total, so this page reports what it was given rather than the size of the graph.
              </Note>
            </StackLayout>
          </SectionCard>
        </>
      ) : null}
    </StackLayout>
  );
}
