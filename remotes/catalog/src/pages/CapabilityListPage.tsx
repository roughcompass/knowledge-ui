import {
  Dropdown,
  FlexLayout,
  Input,
  Option,
  Pill,
  StackLayout,
  StatusAdornment,
  Tag,
  Text,
} from '@salt-ds/core';
import {
  CursorStack,
  LIFECYCLE_STATES,
  filterSignature,
  useCapabilities,
  useSearch,
  type EntityRef,
  type Lifecycle,
  type RegistryClient,
  type SearchHit,
} from '@knowledge-ui/api-client';
import { useSession, type Session } from '@knowledge-ui/auth';
import {
  CursorPager,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  PageHeader,
  RetrievalArmsBar,
  RetrievalArmsLegend,
  popoverOverlayProps,
  type Column,
} from '@knowledge-ui/ui-kit';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * The capability catalog: one page, two modes.
 *
 * A `q` in the URL means search, its absence means browse. One page rather than
 * two because they answer the same question with different inputs, and every
 * piece of state lives in the query string — so any view is a link someone can
 * paste to a colleague.
 *
 * There is no lifecycle column, and that is not an omission. The list endpoint
 * returns entity references only: id, tenant, type, name, external id, active
 * flag and creation time. Lifecycle lives on the detail resource, so a column
 * would cost one request per row. It is offered as a filter instead — and when
 * a filter is applied every visible row carries that value by construction,
 * which is the same information without the waterfall.
 */
export function CapabilityListPage() {
  const { session, client } = useSession<RegistryClient>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const lifecycle = (params.get('lifecycle') ?? '') as Lifecycle | '';
  const entityType = params.get('type') ?? '';
  const isSearching = q.trim().length > 0;

  const scope = {
    personaKey: session.personaKey ?? 'unknown',
    tenantSlug: session.tenantSlug,
  };

  // The stack resets whenever the filters change. Paging back with cursors from
  // a different result set silently shows the wrong rows, which is worse than
  // losing the history.
  const signature = filterSignature({ q, lifecycle, entityType });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const browse = useCapabilities(client, scope, {
    cursor,
    ...(lifecycle ? { lifecycle } : {}),
    ...(entityType ? { entityType } : {}),
  });

  const search = useSearch(
    client,
    scope,
    { q, ...(lifecycle ? { lifecycle } : {}), ...(entityType ? { entityType } : {}) },
    { enabled: isSearching },
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setCursor(null);
  };

  const browseColumns: Array<Column<EntityRef>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (row) => <Text>{row.name}</Text>,
      },
      { key: 'entity_type', header: 'Type', render: (row) => <Tag>{row.entity_type}</Tag> },
      {
        key: 'external_id',
        header: 'External id',
        render: (row) => <Text color="secondary">{row.external_id ?? '—'}</Text>,
      },
      {
        key: 'is_active',
        header: 'Active',
        render: (row) => (
          <FlexLayout gap={1} align="center">
            <StatusAdornment status={row.is_active ? 'success' : 'warning'} />
            <Text styleAs="notation">{row.is_active ? 'active' : 'inactive'}</Text>
          </FlexLayout>
        ),
      },
      {
        key: 'created_at',
        header: 'Created',
        render: (row) => (
          <Text styleAs="notation" color="secondary">
            {new Date(row.created_at).toLocaleDateString()}
          </Text>
        ),
      },
    ],
    [],
  );

  const searchColumns: Array<Column<SearchHit>> = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (row) => <Text>{row.name}</Text> },
      { key: 'entity_type', header: 'Type', render: (row) => <Tag>{row.entity_type}</Tag> },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        render: (row) => <Text>{row.score.toFixed(3)}</Text>,
      },
      {
        key: 'arms',
        header: 'Retrieval arms',
        // The most interesting column on the page: which of the three arms
        // actually found this result. The legend is rendered once above the
        // table rather than repeated on all 47 rows.
        render: (row) => (
          <RetrievalArmsBar arms={row.retrieval_arms ?? {}} score={row.score} showLegend={false} />
        ),
      },
    ],
    [],
  );

  const error = isSearching ? search.error : browse.error;
  const isPending = isSearching ? search.isPending : browse.isPending;
  const rows = isSearching ? (search.data?.items ?? []) : (browse.data?.items ?? []);
  const nextCursor = isSearching ? null : (browse.data?.next_cursor ?? null);

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Capabilities"
        description={
          isSearching
            ? `Ranked results for “${q}”${search.data ? ` — ${search.data.total} in ${search.data.took_ms} ms` : ''}`
            : 'Everything published in this tenant.'
        }
      />

      <FilterBar label="Filter capabilities">
        <FilterField label="Search" basis="22rem" grow>
          <Input
            bordered
            value={q}
            placeholder="Rank by relevance…"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setParam('q', event.target.value)}
          />
        </FilterField>

        <FilterField label="Lifecycle" basis="11rem">
          <Dropdown
            bordered
            value={lifecycle || 'Any'}
            onSelectionChange={(_e, selected) => setParam('lifecycle', selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            {LIFECYCLE_STATES.map((state) => (
              <Option key={state} value={state}>
                {state}
              </Option>
            ))}
          </Dropdown>
        </FilterField>

        <FilterField label="Type" basis="11rem">
          <Dropdown
            bordered
            value={entityType || 'Any'}
            onSelectionChange={(_e, selected) => setParam('type', selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            <Option value="capability">capability</Option>
            <Option value="concept">concept</Option>
            <Option value="operation">operation</Option>
          </Dropdown>
        </FilterField>
      </FilterBar>

      {lifecycle ? (
        // With a lifecycle filter applied every row below carries that value, so
        // the chip conveys what a column would have.
        <FlexLayout gap={1} align="center">
          <Text styleAs="notation" color="secondary">
            Filtered:
          </Text>
          <Pill onClick={() => setParam('lifecycle', '')}>lifecycle: {lifecycle} ✕</Pill>
        </FlexLayout>
      ) : null}

      {error ? <ErrorPanel error={error} title="Could not load capabilities" /> : null}

      {isSearching ? (
        <>
          <RetrievalArmsLegend />
          <DataTable
            card
            caption={`Search results for ${q}`}
            zebra
            hideCaption
            columns={searchColumns}
            rows={rows as SearchHit[]}
            getRowId={(row) => row.entity_id}
            isLoading={isPending}
            emptyTitle="No matches"
            emptyDescription="No capability scored against that query."
            onRowClick={(row) => navigate(row.name)}
          />
        </>
      ) : (
        <>
          <DataTable
            card
            caption="Capabilities in this tenant"
            zebra
            hideCaption
            columns={browseColumns}
            rows={rows as EntityRef[]}
            getRowId={(row) => row.entity_id}
            isLoading={isPending}
            emptyTitle="No capabilities"
            emptyDescription="Nothing has been published in this tenant yet."
            onRowClick={(row) => navigate(row.name)}
          />
          <CursorPager
            showingCount={rows.length}
            isLoading={isPending}
            canPrev={stack.current.canGoBack}
            canNext={nextCursor !== null}
            onPrev={() => setCursor(stack.current.pop())}
            onNext={() => {
              stack.current.push(cursor);
              setCursor(nextCursor);
            }}
          />
        </>
      )}
    </StackLayout>
  );
}

export type { Session };
