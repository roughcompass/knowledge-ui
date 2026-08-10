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
  SectionCard,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  Note,
  PageHeader,
  RetrievalArmsBar,
  RetrievalArmsLegend,
  countText,
  isoDay,
  popoverOverlayProps,
  termText,
  type Column,
} from '@knowledge-ui/ui-kit';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The capability catalog: one page, two modes.
 *
 * A `q` in the URL means search, its absence means browse. One page rather than
 * two because they answer the same question with different inputs, and every
 * piece of state lives in the query string — so any view is a link someone can
 * paste to a colleague.
 *
 * There is no lifecycle column, and that is not an omission. The list endpoint
 * returns entity references only: id, tenant, type, name, external id and
 * creation time, plus an active flag on audit reads. Lifecycle lives on the
 * detail resource, so a column would cost one request per row. It is offered as
 * a filter instead — and when a filter is applied every visible row carries
 * that value by construction, which is the same information without the
 * waterfall.
 *
 * ## Columns that say the same thing on every row are collapsed
 *
 * Of the fields the list resource does return, several are usually identical
 * down the whole page: a tenant publishes mostly capabilities, seeded on one
 * day. The table was therefore mostly constant, and the one discriminating
 * column — the name — competed for width with columns that could not tell any
 * two rows apart.
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
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const lifecycle = (params.get('lifecycle') ?? '') as Lifecycle | '';
  const entityType = params.get('type') ?? '';
  /*
    Time travel, from the URL. The list endpoint accepts `as_of`, and a link
    carrying it is a claim about what the reader is seeing — so it is read and
    passed through rather than dropped, and the view says it is historical.
  */
  const asOf = params.get('as_of') ?? undefined;
  const isSearching = q.trim().length > 0;

  const scope = {
    personaKey: session.personaKey ?? 'unknown',
    tenantSlug: session.tenantSlug,
  };

  // The stack resets whenever the filters change. Paging back with cursors from
  // a different result set silently shows the wrong rows, which is worse than
  // losing the history — and `as_of` is part of the result set's identity, since
  // a cursor minted against the current catalog does not page a historical one.
  const signature = filterSignature({ q, lifecycle, entityType, asOf });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const browse = useCapabilities(client, scope, {
    cursor,
    ...(lifecycle ? { lifecycle } : {}),
    ...(entityType ? { entityType } : {}),
    ...(asOf ? { asOf } : {}),
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
        /*
          A real anchor, not a row handler. The row used to be the control, which gave
          up middle-click, "copy link address" and the link role a screen reader
          announces. The filters ride along so the detail page's back control can
          restore them.
        */
        href: (row) =>
          `${encodeURIComponent(row.name)}${
            params.toString() ? `?from=${encodeURIComponent(params.toString())}` : ''
          }`,
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
            // most of this catalog is simply not published to a contextplane.
            <Text color="secondary" styleAs="notation">
              Not published
            </Text>
          ),
      },
      {
        key: 'is_active',
        header: 'Active',
        /*
          `is_active` is audit-only on this shape: a response that omits it has
          already filtered inactive rows out. An absent field is not a value, so
          the cell only renders for a served boolean — coercing the absence would
          declare every row inactive while the detail page says the opposite.
        */
        render: (row) =>
          typeof row.is_active === 'boolean' ? (
            <FlexLayout gap={1} align="center">
              <StatusAdornment status={row.is_active ? 'success' : 'warning'} />
              <Text styleAs="notation">{row.is_active ? 'active' : 'inactive'}</Text>
            </FlexLayout>
          ) : null,
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
    [params],
  );

  const [showScores, setShowScores] = useState(false);

  const searchColumns: Array<Column<SearchHit>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (row) => <Text>{row.name}</Text>,
        /*
          A real anchor, not a row handler. The row used to be the control, which gave
          up middle-click, "copy link address" and the link role a screen reader
          announces. The filters ride along so the detail page's back control can
          restore them.
        */
        href: (row) =>
          `${encodeURIComponent(row.name)}${
            params.toString() ? `?from=${encodeURIComponent(params.toString())}` : ''
          }`,
      },
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
    [showScores, params],
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
   * Only the low-cardinality fields are candidates. `name` is the row's identity
   * and never collapses. `external_id` collapses only when every row on the page
   * lacks one — a page of package coordinates keeps its column, and with keyset
   * paging and no totals the sentence can only speak for the page it describes.
   */
  const browseRows = useMemo(
    () => (isSearching ? [] : (browse.data?.items ?? [])),
    [isSearching, browse.data],
  );
  const { visibleBrowseColumns, sharedFacts, inactivePageFact } = useMemo(() => {
    const constants: Record<string, string> = {};
    const hidden = new Set<string>();
    let inactive: string | undefined;
    const [first] = browseRows;

    /*
     * `is_active` is audit-only on the list shape, and a response that omits it
     * has already filtered inactive rows out — so absence carries nothing worth
     * a column, and is never a value a sentence may claim.
     */
    if (!browseRows.some((row) => typeof row.is_active === 'boolean')) {
      hidden.add('is_active');
    }

    if (first && browseRows.length > 1) {
      const distinct = <T,>(read: (row: EntityRef) => T) =>
        new Set(browseRows.map(read)).size === 1;

      if (distinct((row) => row.entity_type)) {
        constants.entity_type = `${termText(first.entity_type)}`;
      }
      if (!hidden.has('is_active') && distinct((row) => row.is_active)) {
        if (first.is_active) {
          constants.is_active = 'active';
        } else {
          // Named in full and carried with warning weight below, because a page
          // of contextplane-inactive entries is a state worth stopping on.
          hidden.add('is_active');
          inactive = 'Every entry on this page is marked inactive in the contextplane.';
        }
      }
      if (browseRows.every((row) => !row.external_id)) {
        hidden.add('external_id');
        constants.external_id = 'not published to a contextplane';
      }
      if (distinct((row) => isoDay(row.created_at))) {
        const day = isoDay(first.created_at);
        if (day) constants.created_at = `created ${day}`;
      }
    }

    return {
      visibleBrowseColumns: browseColumns.filter(
        (column) => !(column.key in constants) && !hidden.has(column.key),
      ),
      sharedFacts: Object.values(constants),
      inactivePageFact: inactive,
    };
  }, [browseRows, browseColumns]);

  /*
   * The timing rounded to whole milliseconds — presentation of a served value,
   * not a derived one. When the value is not an honest number the clause is
   * dropped rather than rendered as a fake zero.
   */
  const tookMs = countText(search.data?.took_ms);

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Capabilities"
        description={
          isSearching
            ? `Ranked results for “${q}”${
                search.data ? ` — ${search.data.total}${tookMs ? ` in ${tookMs} ms` : ''}` : ''
              }`
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
          {/*
            Named as search results rather than as the catalogue. The two tables on
            this page look alike and answer different questions, and a reader who
            cannot tell which one they are reading will quote a ranked subset as the
            whole tenant.
          */}
          <SectionCard
            description={`Ranked matches for “${q}”, best first. This is a subset of the catalogue, not all of it.`}
            flush
            banded
          >
            <DataTable
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
            />
          </SectionCard>
        </>
      ) : (
        <>
          {asOf ? (
            <Note label="Historical view" variant="warning">
              {`Showing this catalog as it stood at ${asOf}. Remove the as_of parameter to return to the current view.`}
            </Note>
          ) : null}
          {inactivePageFact ? (
            <Note label="Marked inactive" variant="warning">
              {inactivePageFact}
            </Note>
          ) : null}
          {sharedFacts.length > 0 ? (
            // Said once instead of repeated down whole columns. It names the page
            // it describes, because the next one may not share these values.
            <Text styleAs="notation" color="secondary">
              Every row on this page is {sharedFacts.join(', ')}.
            </Text>
          ) : null}
          <SectionCard description="Every capability in this tenant, newest first." flush banded>
            <DataTable
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
            />
          </SectionCard>
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
