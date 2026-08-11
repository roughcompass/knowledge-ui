import {
  Button,
  Dropdown,
  FlexLayout,
  Option,
  StackLayout,
  StatusIndicator,
  Tag,
  Text,
} from '@salt-ds/core';
import {
  SYNC_RUN_STATUSES,
  useSyncRuns,
  useSyncSources,
  type RegistryClient,
  type SyncRun,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  PageHeader,
  Prose,
  SectionCard,
  durationText,
  instantText,
  popoverOverlayProps,
  termText,
  type Column,
  KLink,
} from '@knowledge-ui/ui-kit';
import { useMemo, useState } from 'react';

/**
 * What each connector actually did, and when.
 *
 * Two things about this endpoint shape the page.
 *
 * It has **no pagination at all** — no cursor, no page size, no server-side limit.
 * A handful of sources on a nightly schedule accumulate rows indefinitely, so the
 * window is a client-side default rather than something the server caps, and the
 * page says so rather than implying it is showing everything.
 *
 * And `error_summary` is a free-form string that can be a stack trace. It sits
 * behind a per-row expander rather than in a column, following the audit log's diff
 * treatment: a column would either truncate the useful part or destroy the row
 * heights of every other row on the page.
 */

/** How far back the page looks by default. The list is unbounded; this is the bound. */
const DEFAULT_WINDOW_DAYS = 7;

/*
 * `StatusIndicator` rather than `StatusAdornment`: the latter excludes `'info'`, and
 * `queued` and `running` are neither good news nor bad — they are "not finished yet".
 * Forcing them into success or warning would state an outcome the run has not reached.
 */
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  done: 'success',
  partial: 'warning',
  failed: 'error',
  running: 'info',
  queued: 'info',
};

export function SyncRunsPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [sourceId, setSourceId] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
   * Computed once per mount, not per render. A `new Date()` in the render body would
   * produce a different value on every pass, and it is part of the query key — so
   * the query would refetch continuously.
   */
  const [from] = useState(() => new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  // Feeds the source filter with names rather than making an operator paste a UUID.
  const sources = useSyncSources(client, scope);

  const runs = useSyncRuns(client, scope, {
    from,
    ...(sourceId ? { sourceId } : {}),
    ...(status ? { status } : {}),
  });

  const nameOf = useMemo(() => {
    const byId = new Map((sources.data ?? []).map((s) => [s.source_id, s.display_name]));
    return (id: string) => byId.get(id) ?? id;
  }, [sources.data]);

  const columns: Array<Column<SyncRun>> = useMemo(
    () => [
      {
        key: 'started_at',
        header: 'Started',
        figures: 'tabular' as const,
        /*
          The way into the run. This table listed failures with a truncated summary
          and no destination, so reading what a connector actually reported meant
          going to the server logs.
        */
        render: (row) => (
          <KLink to={`runs/${String(row.sync_run_id)}`} underline="never" color="accent">
            {instantText(row.started_at) ?? '—'}
          </KLink>
        ),
      },
      {
        key: 'source_id',
        header: 'Source',
        render: (row) => <Text>{nameOf(row.source_id)}</Text>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <FlexLayout gap={1} align="center">
            <StatusIndicator status={STATUS_TONE[row.status] ?? 'info'} />
            <Text styleAs="notation">{row.status}</Text>
          </FlexLayout>
        ),
      },
      { key: 'trigger', header: 'Trigger', render: (row) => <Tag>{row.trigger}</Tag> },
      {
        key: 'duration_s',
        header: 'Duration',
        align: 'right',
        render: (row) =>
          // Null means still running, which is not the same as zero seconds.
          row.duration_s === null ? (
            <Text color="secondary">—</Text>
          ) : (
            <Text>{durationText(row.duration_s) ?? '—'}</Text>
          ),
      },
      {
        key: 'artifact_count',
        header: 'Artifacts',
        align: 'right',
        render: (row) =>
          row.artifact_count === null ? (
            <Text color="secondary">—</Text>
          ) : (
            <Text>{row.artifact_count.toLocaleString()}</Text>
          ),
      },
      {
        key: 'error_summary',
        header: 'Detail',
        render: (row) =>
          row.error_summary ? (
            <Button
              appearance="transparent"
              sentiment="neutral"
              onClick={() =>
                setExpanded((current) => (current === row.sync_run_id ? null : row.sync_run_id))
              }
            >
              {expanded === row.sync_run_id ? 'Hide' : 'Show'}
            </Button>
          ) : (
            <Text color="secondary">—</Text>
          ),
      },
    ],
    [expanded, nameOf],
  );

  const rows = runs.data ?? [];

  return (
    <StackLayout gap={3}>
      <PageHeader
        eyebrow="Platform operations"
        title="Sync runs"
        description={`Connector runs from the last ${DEFAULT_WINDOW_DAYS} days, newest first — older runs exist but are not shown.`}
      />

      <FilterBar label="Filter sync runs">
        <FilterField label="Source" basis="18rem" grow>
          <Dropdown
            bordered
            value={sourceId === '' ? 'Any' : nameOf(sourceId)}
            onSelectionChange={(_event, selected) => setSourceId(selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            {(sources.data ?? []).map((source) => (
              <Option key={source.source_id} value={source.source_id}>
                {source.display_name}
              </Option>
            ))}
          </Dropdown>
        </FilterField>

        <FilterField label="Status" basis="11rem">
          <Dropdown
            bordered
            value={status ? termText(status) : 'Any'}
            onSelectionChange={(_event, selected) => setStatus(selected?.[0] ?? '')}
            OverlayProps={popoverOverlayProps}
          >
            <Option value="">Any</Option>
            {SYNC_RUN_STATUSES.map((value) => (
              <Option key={value} value={value}>
                {termText(value)}
              </Option>
            ))}
          </Dropdown>
        </FilterField>
      </FilterBar>

      {runs.error ? <ErrorPanel error={runs.error} title="Could not list sync runs" /> : null}

      <SectionCard title="Runs" banded flush>
        {/*
          Not zebra: an open failure panel occupies a striped row slot of its
          own, which flips the stripe phase of every row beneath it.
        */}
        <DataTable
          caption="Connector runs"
          hideCaption
          columns={columns}
          rows={rows}
          getRowId={(row) => row.sync_run_id}
          isLoading={runs.isPending}
          hasError={Boolean(runs.error)}
          emptyTitle="No runs in this window"
          emptyDescription="Nothing has run in the last week under these filters. A source with no schedule only runs when triggered by hand."
          emptyHeadingLevel="h3"
          expandedRowId={expanded}
          renderDetail={(row) => (
            <StackLayout gap={2}>
              <Prose>
                <Text color="secondary">
                  Reported by the connector. A high superseded count right after a configuration
                  change is expected; a high count on a steady source usually means the connector
                  stopped discovering artifacts it used to find.
                </Text>
              </Prose>
              <Text styleAs="code">{row.error_summary}</Text>
            </StackLayout>
          )}
        />
      </SectionCard>
    </StackLayout>
  );
}
