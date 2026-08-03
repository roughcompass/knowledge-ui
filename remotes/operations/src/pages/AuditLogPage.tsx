import {
  Button,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  FlexLayout,
  Input,
  StackLayout,
  Tag,
  StatusAdornment,
  Text,
} from '@salt-ds/core';
import {
  CursorStack,
  filterSignature,
  useAuditLog,
  type AuditRow,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  CopyButton,
  CursorPager,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  JsonDiff,
  PageHeader,
  type Column,
} from '@knowledge-ui/ui-kit';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

/**
 * The audit log.
 *
 * Requires the auditor role specifically. The host gates the route, but this
 * page also handles a 403 of its own: the role can change under it via the
 * persona switcher, and a stale nav entry should explain rather than break.
 *
 * The request id column earns its place — it is the value that makes a backend
 * investigation fast, and it is unusable unless it can be copied.
 */
export function AuditLogPage() {
  const { session, client } = useSession<RegistryClient>();
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'audit:read');

  const signature = filterSignature({ actorId, action });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const query = useAuditLog(
    client,
    scope,
    { cursor, ...(actorId ? { actorId } : {}), ...(action ? { action } : {}) },
    { enabled: allowed },
  );

  const columns: Array<Column<AuditRow>> = useMemo(
    () => [
      {
        key: 'ts',
        header: 'When',
        render: (row) => (
          <Text styleAs="notation">{new Date(String(row.ts)).toLocaleString()}</Text>
        ),
      },
      { key: 'action', header: 'Action', render: (row) => <Tag>{String(row.action)}</Tag> },
      {
        key: 'target',
        header: 'Target',
        render: (row) => (
          <Text styleAs="notation" color="secondary">
            {String(row.target_type)} · {String(row.target_id ?? '—')}
          </Text>
        ),
      },
      {
        key: 'error_code',
        header: 'Outcome',
        render: (row) => (
          <FlexLayout gap={1} align="center">
            <StatusAdornment status={row.error_code ? 'error' : 'success'} />
            <Text styleAs="notation">{row.error_code ? String(row.error_code) : 'ok'}</Text>
          </FlexLayout>
        ),
      },
      {
        key: 'request_id',
        header: 'Request id',
        render: (row) =>
          row.request_id ? (
            <FlexLayout gap={1} align="center">
              <Text styleAs="code">{String(row.request_id)}</Text>
              <CopyButton value={String(row.request_id)} label="Copy" />
            </FlexLayout>
          ) : (
            <Text color="secondary">—</Text>
          ),
      },
      {
        key: 'diff',
        header: 'Change',
        render: (row) => (
          <Button
            appearance="transparent"
            sentiment="neutral"
            onClick={() =>
              setExpanded((current) =>
                current === String(row.audit_id) ? null : String(row.audit_id),
              )
            }
          >
            {expanded === String(row.audit_id) ? 'Hide' : 'Show'}
          </Button>
        ),
      },
    ],
    [expanded],
  );

  const rows = query.data?.items ?? [];
  const expandedRow = rows.find((row) => String(row.audit_id) === expanded);

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Audit log"
        description="Every recorded change, newest first. Reading this requires the auditor role."
      />

      <FilterBar label="Filter the audit log">
        <FilterField label="Actor" basis="18rem" grow>
          <Input
            bordered
            value={actorId}
            placeholder="actor id"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setActorId(event.target.value)}
          />
        </FilterField>
        <FilterField label="Action" basis="18rem" grow>
          <Input
            bordered
            value={action}
            placeholder="lifecycle.transition"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setAction(event.target.value)}
          />
        </FilterField>
      </FilterBar>

      {query.error ? (
        <ErrorPanel
          error={query.error}
          title={
            // The audit endpoint answers 422 for a bad cursor, unlike the list
            // endpoints' 400 — and a stale link is the usual cause.
            String((query.error as { code?: string }).code) === 'invalid_cursor'
              ? 'That link has expired'
              : 'Could not load the audit log'
          }
        />
      ) : null}

      <DataTable
        card
        caption="Audit entries"
        zebra
        hideCaption
        columns={columns}
        rows={rows}
        getRowId={(row) => String(row.audit_id)}
        isLoading={query.isPending && allowed}
        emptyTitle="No audit entries"
        emptyDescription="Nothing matching those filters has been recorded."
      />

      {expandedRow ? (
        <Collapsible open>
          <CollapsibleTrigger>
            <Button appearance="transparent" sentiment="neutral">
              Change detail
            </Button>
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <JsonDiff
              before={expandedRow.before_jsonb}
              after={expandedRow.after_jsonb}
              hideUnchanged
            />
          </CollapsiblePanel>
        </Collapsible>
      ) : null}

      <CursorPager
        showingCount={rows.length}
        isLoading={query.isPending}
        canPrev={stack.current.canGoBack}
        canNext={(query.data?.next_cursor ?? null) !== null}
        onPrev={() => setCursor(stack.current.pop())}
        onNext={() => {
          stack.current.push(cursor);
          setCursor(query.data?.next_cursor ?? null);
        }}
      />
    </StackLayout>
  );
}
