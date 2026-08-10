import {
  Button,
  FlexLayout,
  Input,
  StackLayout,
  Tag,
  StatusAdornment,
  Text,
  Tooltip,
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
  SectionCard,
  PageHeader,
  instantText,
  type Column,
  EntityLink,
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
  const { session, client, hrefForRemote } = useSession<RegistryClient>();
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
        figures: 'tabular' as const,
        render: (row) => <Text styleAs="notation">{instantText(row.ts) ?? '—'}</Text>,
      },
      { key: 'action', header: 'Action', render: (row) => <Tag>{String(row.action)}</Tag> },
      {
        key: 'actor_id',
        header: 'Actor',
        /*
          A principal, not an entity: no endpoint resolves a principal id to a
          display name, so the short code face is the whole rendering — the same
          treatment the Target column gives an id without a page. The click
          filters rather than navigates, because a principal has no page either;
          it is the only way this screen offers to discover a value the Actor
          filter otherwise demands be pasted in from somewhere else.
        */
        render: (row) => {
          if (!row.actor_id) return <Text color="secondary">—</Text>;
          const actor = String(row.actor_id);
          return (
            <FlexLayout gap={1} align="center">
              <Tooltip content={actor}>
                <Button
                  appearance="transparent"
                  sentiment="neutral"
                  onClick={() => setActorId(actor)}
                >
                  <Text styleAs="code">{shortPrincipal(actor)}</Text>
                </Button>
              </Tooltip>
              <CopyButton value={actor} label="Copy Id" />
            </FlexLayout>
          );
        },
      },
      {
        key: 'target',
        header: 'Target',
        linked: true,
        /*
          The audit log names what an action was performed on, and rendered it as
          type-and-id text. An auditor reading a row wants the thing itself; only a
          capability target has a page today, so only that one links — the rest keep
          the short id and its copy control rather than pretending to a destination.
        */
        render: (row) => {
          const targetId = row.target_id ? String(row.target_id) : null;
          const type = String(row.target_type);
          if (!targetId)
            return (
              <Text styleAs="notation" color="secondary">
                {type}
              </Text>
            );
          return (
            <FlexLayout gap={1} align="center">
              <Text styleAs="notation" color="secondary">
                {type}
              </Text>
              <EntityLink
                id={targetId}
                to={
                  type === 'capability' || type === 'entity'
                    ? hrefForRemote?.('catalog', targetId)
                    : undefined
                }
              />
            </FlexLayout>
          );
        },
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
        header: 'Request ID',
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
    [expanded, hrefForRemote],
  );

  const rows = query.data?.items ?? [];

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

      {/*
        Not zebra: an open change panel occupies a striped row slot of its own,
        which flips the stripe phase of every row beneath it.
      */}
      {/*
        The same header every other table in the console carries. No title: the
        page heading above already names this, and a second copy of that name in a
        third size is what the header exists to avoid. The description says what the
        rows are, which the page title does not.
      */}
      <SectionCard
        description="Recorded actions, newest first. Every entry is written by the service at the moment of the change, so this is the record rather than a reconstruction of it."
        flush
        banded
      >
        <DataTable
          caption="Audit entries"
          hideCaption
          columns={columns}
          rows={rows}
          getRowId={(row) => String(row.audit_id)}
          isLoading={query.isPending && allowed}
          hasError={Boolean(query.error)}
          emptyTitle="No audit entries"
          emptyDescription="Nothing matching those filters has been recorded."
          expandedRowId={expanded}
          renderDetail={(row) => (
            <JsonDiff before={row.before_jsonb} after={row.after_jsonb} hideUnchanged />
          )}
        />
      </SectionCard>

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

/*
 * The same shape rule the entity reference uses: an opaque UUID carries nothing
 * in its first eight characters beyond telling two rows apart, while any other
 * principal id — a client id, a service account slug — may be the most readable
 * name the row will ever have, and cutting it destroys that.
 */
function shortPrincipal(id: string): string {
  const opaque = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return opaque ? id.slice(0, 8) : id;
}
