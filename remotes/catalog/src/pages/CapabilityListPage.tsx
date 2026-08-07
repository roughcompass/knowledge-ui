import {
  Checkbox,
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
import { can, useSession } from '@knowledge-ui/auth';
import {
  CursorPager,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  PageHeader,
  RetrievalArmsBar,
  RetrievalArmsLegend,
  isoDay,
  popoverOverlayProps,
  termText,
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
 *
 * ## Columns that say the same thing on every row are collapsed
 *
 * Of the five fields the list resource does return, three are usually identical
 * down the whole page: a tenant publishes mostly capabilities, mostly active,
 * seeded on one day. The table was therefore four-fifths constant, and the one
 * discriminating column — the name — competed for width with three that could
 * not tell any two rows apart.
 *
 * So a column is dropped when every row on the page shares its value, and the
 * shared value is stated once above the table instead. Nothing is hidden: the
 * fact moves from twenty repetitions to one sentence that also says how many
 * rows it covers. This is a judgement about the rows on screen, recomputed for
 * each page, not a claim about the catalog — the sentence says "on this page"
 * because the next page may differ.
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
      {
        key: 'entity_type',
        header: 'Type',
        render: (row) => <Tag>{termText(row.entity_type)}</Tag>,
      },
      {
        key: 'external_id',
        header: 'External ID',
        render: (row) =>
          row.external_id ? (
            <Text styleAs="code">{row.external_id}</Text>
          ) : (
            // Named rather than dashed. An em-dash in a column of package
            // coordinates reads as a missing value the reader should chase;
            // most of this catalog is simply not published to a registry.
            <Text color="secondary" styleAs="notation">
              Not published
            </Text>
          ),
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
        figures: 'tabular' as const,
        render: (row) => (
          <Text styleAs="notation" color="secondary">
            {/*
              Not `toLocaleDateString`. The served value is UTC, so parsing it and
              rendering it locally lands on the previous day for every reader behind
              Greenwich — a created-on date that disagrees with the API by one is
              worse than one that is plainly UTC.
            */}
            {isoDay(row.created_at) ?? '—'}
          </Text>
        ),
      },
    ],
    [],
  );

  const [showScores, setShowScores] = useState(false);

  const searchColumns: Array<Column<SearchHit>> = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (row) => <Text>{row.name}</Text> },
      {
        key: 'entity_type',
        header: 'Type',
        render: (row) => <Tag>{termText(row.entity_type)}</Tag>,
      },
      {
        key: 'arms',
        header: 'Retrieval Arms',
        // The most interesting column on the page: which of the three arms
        // actually found this result. The legend is rendered once above the
        // table rather than repeated on every row.
        render: (row) => (
          <RetrievalArmsBar arms={row.retrieval_arms ?? {}} score={row.score} showLegend={false} />
        ),
      },
      /*
       * Behind a toggle, off by default. `0.940` next to `0.870` is a fused score
       * on an arbitrary scale: it is not a percentage, not a confidence, and not
       * comparable between queries — but three decimal places in a right-aligned
       * numeric column read as all three. The ordering of the rows already carries
       * everything a reader can act on, and the number stays one click away for
       * whoever is tuning retrieval.
       */
      ...(showScores
        ? [
            {
              key: 'score',
              header: 'Score',
              align: 'right' as const,
              render: (row: SearchHit) => <Text>{row.score.toFixed(3)}</Text>,
            },
          ]
        : []),
    ],
    [showScores],
  );

  const error = isSearching ? search.error : browse.error;
  const isPending = isSearching ? search.isPending : browse.isPending;
  const rows = isSearching ? (search.data?.items ?? []) : (browse.data?.items ?? []);
  const nextCursor = isSearching ? null : (browse.data?.next_cursor ?? null);

  /*
   * One sentence that differs by what the reader does here, not by who they are.
   *
   * Someone who publishes opens this list to find out who depends on their work;
   * someone who consumes opens it to find something to build on. Same page, same
   * columns, same order — only the sentence that says what to do next changes,
   * because a page that rearranges itself per reader is a page nobody can be
   * taught or supported on, and the persona switcher means one person sees every
   * variant inside a minute.
   *
   * Keyed on the capability rather than the role. "Do you publish" is a fact this
   * app is allowed to ask — `usage:read:owned` is granted to the roles that own
   * capabilities — and keying copy on a role name would put role vocabulary back
   * into a component, which is the one thing the capability map exists to prevent.
   */
  const browseFraming = can(session, 'usage:read:owned')
    ? 'Everything published in this tenant, including what you publish. Open one to see who depends on it before you change it.'
    : 'Everything published in this tenant. Open one to see what it is for, who else depends on it, and how to adopt it.';

  /*
   * Which browse columns tell two rows apart, and what the others all said.
   *
   * Only the three low-cardinality fields are candidates. `name` is the row's
   * identity and never collapses, and `external_id` genuinely varies — collapsing
   * it would mean hiding a package coordinate on the one page where every entry
   * happened to have none, which is a fact worth a column of its own.
   */
  const browseRows = useMemo(
    () => (isSearching ? [] : (browse.data?.items ?? [])),
    [isSearching, browse.data],
  );
  const { visibleBrowseColumns, sharedFacts } = useMemo(() => {
    const constants: Record<string, string> = {};
    const [first] = browseRows;

    if (first && browseRows.length > 1) {
      const distinct = <T,>(read: (row: EntityRef) => T) =>
        new Set(browseRows.map(read)).size === 1;

      if (distinct((row) => row.entity_type)) {
        constants.entity_type = `${termText(first.entity_type)}`;
      }
      if (distinct((row) => row.is_active)) {
        constants.is_active = first.is_active ? 'active' : 'inactive';
      }
      if (distinct((row) => isoDay(row.created_at))) {
        const day = isoDay(first.created_at);
        if (day) constants.created_at = `created ${day}`;
      }
    }

    return {
      visibleBrowseColumns: browseColumns.filter((column) => !(column.key in constants)),
      sharedFacts: Object.values(constants),
    };
  }, [browseRows, browseColumns]);

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Capabilities"
        description={
          isSearching
            ? `Ranked results for “${q}”${search.data ? ` — ${search.data.total} in ${search.data.took_ms} ms` : ''}`
            : browseFraming
        }
      />

      <FilterBar label="Filter capabilities">
        <FilterField label="Search" basis="22rem" grow>
          <Input
            bordered
            value={q}
            // The action, not the mechanism. "Rank by relevance" described what the
            // server does with the string; a reader looking at an empty field needs
            // to know what to put in it.
            placeholder="Search capabilities…"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setParam('q', event.target.value)}
          />
        </FilterField>

        <FilterField label="Lifecycle" basis="11rem">
          <Dropdown
            bordered
            value={lifecycle ? termText(lifecycle) : 'Any'}
            onSelectionChange={(_e, selected) => setParam('lifecycle', selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            {LIFECYCLE_STATES.map((state) => (
              <Option key={state} value={state}>
                {termText(state)}
              </Option>
            ))}
          </Dropdown>
        </FilterField>

        <FilterField label="Type" basis="11rem">
          <Dropdown
            bordered
            value={entityType ? termText(entityType) : 'Any'}
            onSelectionChange={(_e, selected) => setParam('type', selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            <Option value="capability">Capability</Option>
            <Option value="concept">Concept</Option>
            <Option value="operation">Operation</Option>
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
          <FlexLayout gap={1} align="center" justify="space-between">
            <RetrievalArmsLegend />
            <Checkbox
              label="Show relevance scores"
              checked={showScores}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setShowScores(event.target.checked)
              }
            />
          </FlexLayout>
          <DataTable
            card
            caption={`Search results for ${q}`}
            zebra
            hideCaption
            columns={searchColumns}
            rows={rows as SearchHit[]}
            getRowId={(row) => row.entity_id}
            isLoading={isPending}
            hasError={Boolean(error)}
            emptyTitle="No matches"
            emptyDescription={`Nothing in this tenant matched “${q}”. Search covers names and the text recorded against each capability; try a broader word, or clear the lifecycle and type filters.`}
            /*
              Carries the reader's filters forward, so the detail page's back control
              can hand them back. Without it a reader who arrived from a filtered
              search returned to an unfiltered browse and rebuilt it by hand.
            */
            onRowClick={(row) =>
              navigate({
                pathname: row.name,
                search: params.toString() ? `?from=${encodeURIComponent(params.toString())}` : '',
              })
            }
          />
        </>
      ) : (
        <>
          {sharedFacts.length > 0 ? (
            // Said once instead of repeated down three columns. It names the page
            // it describes, because the next one may not share these values.
            <Text styleAs="notation" color="secondary">
              Every row on this page is {sharedFacts.join(', ')}.
            </Text>
          ) : null}
          <DataTable
            card
            caption="Capabilities in this tenant"
            zebra
            hideCaption
            columns={visibleBrowseColumns}
            rows={browseRows}
            getRowId={(row) => row.entity_id}
            isLoading={isPending}
            hasError={Boolean(error)}
            emptyTitle="No capabilities"
            emptyDescription="Nothing has been published in this tenant yet."
            /*
              Carries the reader's filters forward, so the detail page's back control
              can hand them back. Without it a reader who arrived from a filtered
              search returned to an unfiltered browse and rebuilt it by hand.
            */
            onRowClick={(row) =>
              navigate({
                pathname: row.name,
                search: params.toString() ? `?from=${encodeURIComponent(params.toString())}` : '',
              })
            }
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
