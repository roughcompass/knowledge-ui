import { Button, Dropdown, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  NOTIFICATION_STATUSES,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationStatus,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterField,
  SectionCard,
  PageHeader,
  UnavailableNotice,
  instantText,
  popoverOverlayProps,
  termText,
  KLink,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * What changed in the capabilities you subscribed to.
 *
 * **This page does not summarise, and that is deliberate.** The server minimizes
 * notification payloads on purpose — it withholds the change body so that a
 * webhook recipient cannot leak it. What arrives is a kind, a classification, a
 * version transition, a timestamp and a fetch URL. Composing those into a
 * sentence would read like a description of the change, and a reader would trust
 * a summary the API never provided. So the fields render as fields, and the
 * capability link is how you find out what actually happened.
 *
 * **Read state lives in the filter, not in the row.** `NotificationItem` carries
 * no read flag; `GET /v1/notifications` takes a `status` parameter defaulting to
 * `unread`. So marking one read is a call plus an invalidation, and the row
 * leaves this view because the server stopped returning it — not because
 * anything here removed it.
 */
export function NotificationsPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [status, setStatus] = useState<NotificationStatus>('unread');
  const query = useNotifications(client, scope, { status });
  const markRead = useMarkNotificationRead(client, scope);
  const markAll = useMarkAllNotificationsRead(client, scope);

  const unreadIds = (query.data?.items ?? []).map((n) => String(n.notification_id));

  const header = (
    <PageHeader
      eyebrow="Capability catalog"
      title="Notifications"
      description="Changes to the capabilities your tenant subscribes to. Open the capability to see what changed — these entries carry the fact of a change, not its contents."
      actions={
        status === 'unread' && unreadIds.length > 0 ? (
          <Button
            appearance="bordered"
            sentiment="neutral"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate({ notificationIds: unreadIds })}
          >
            {markAll.isPending ? 'Marking…' : `Mark ${unreadIds.length} Read`}
          </Button>
        ) : undefined
      }
    />
  );

  const filters = (
    <FilterBar label="Filter notifications">
      <FilterField label="Show" basis="11rem">
        <Dropdown
          bordered
          value={termText(status)}
          onSelectionChange={(_e, selected) =>
            setStatus((selected?.[0] as NotificationStatus) ?? 'unread')
          }
          OverlayProps={popoverOverlayProps}
        >
          {NOTIFICATION_STATUSES.map((value) => (
            <Option key={value} value={value}>
              {termText(value)}
            </Option>
          ))}
        </Dropdown>
      </FilterField>
    </FilterBar>
  );

  /*
    No pending branch: the table below declares its own columns, so it renders its
    skeleton in place and the header and filters stay exactly where they are. The
    spinner branch replaced a table with a centred glyph and then jumped the page
    when the rows landed.
  */
  if (query.error) {
    return (
      <StackLayout gap={3}>
        {header}
        {filters}
        <ErrorPanel error={query.error} title="Could not load notifications" />
      </StackLayout>
    );
  }

  const items = query.data?.items ?? [];

  if (items.length === 0) {
    return (
      <StackLayout gap={3}>
        {header}
        {filters}
        <EmptyState
          title={status === 'unread' ? 'Nothing unread' : 'Nothing here'}
          description={
            status === 'unread'
              ? 'You are up to date with every capability your tenant subscribes to.'
              : 'No notifications match this filter.'
          }
        />
      </StackLayout>
    );
  }

  const rows = items.map((n) => ({
    id: String(n.notification_id),
    slug: String(n.capability_slug),
    kind: String(n.event_kind),
    classification: n.change_classification ?? null,
    version:
      n.version_before || n.version_after
        ? `${n.version_before ?? '—'} → ${n.version_after ?? '—'}`
        : '—',
    occurred: String(n.occurred_at),
  }));

  return (
    <StackLayout gap={3}>
      {header}
      {filters}

      {/*
        The same header every other table in the console carries. No title: the
        page heading above already names this, and a second copy of that name in a
        third size is what the header exists to avoid. The description says what the
        rows are, which the page title does not.
      */}
      <SectionCard
        description="Delivered to this tenant, newest first. A notification records that something changed; it is not an alert, and nothing is retried from here."
        flush
        banded
      >
        <DataTable
          isLoading={query.isPending}
          zebra
          caption="Notifications"
          // The page heading already says this. A visible caption under it repeated
          // the word once more, in a third size.
          hideCaption
          columns={[
            {
              key: 'slug',
              header: 'Capability',
              // Linking out is the whole mechanism for "what changed" — the payload
              // does not carry it, by design.
              render: (row) => (
                <KLink underline="never" color="primary" to={`../${encodeURIComponent(row.slug)}`}>
                  {row.slug}
                </KLink>
              ),
            },
            { key: 'kind', header: 'Event' },
            {
              key: 'classification',
              header: 'Change',
              render: (row) =>
                row.classification ? (
                  <Tag
                    bordered={row.classification !== 'major'}
                    category={row.classification === 'major' ? 5 : undefined}
                  >
                    {row.classification}
                  </Tag>
                ) : (
                  // Absent rather than zero: not every event kind classifies a
                  // change, and an em-dash says "not applicable" where "none"
                  // would say "no change".
                  <Text color="secondary">—</Text>
                ),
            },
            { key: 'version', header: 'Version' },
            {
              key: 'occurred',
              header: 'When',
              figures: 'tabular' as const,
              // This rendered the served `2026-08-01T10:00:00Z` verbatim, which a
              // reader has to convert in their head before it answers the only
              // question they are asking of the column.
              render: (row) => <Text styleAs="notation">{instantText(row.occurred) ?? '—'}</Text>,
            },
            {
              key: 'id',
              header: 'Action',
              render: (row) =>
                status === 'read' ? (
                  <Text color="secondary">Read</Text>
                ) : (
                  <Button
                    appearance="bordered"
                    sentiment="neutral"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate({ notificationId: row.id })}
                  >
                    Mark Read
                  </Button>
                ),
            },
          ]}
          rows={rows}
          getRowId={(row) => row.id}
        />
      </SectionCard>

      {markRead.error ? (
        <ErrorPanel error={markRead.error} title="Could not mark that read" />
      ) : null}

      {/*
        A fan-out is not atomic, so a partial result is a real outcome and gets
        said out loud. Reporting only "done" would leave the reader believing
        rows cleared that are still unread.
      */}
      {markAll.data && markAll.data.failed.length > 0 ? (
        <UnavailableNotice
          title={`${markAll.data.failed.length} of ${
            markAll.data.succeeded.length + markAll.data.failed.length
          } could not be marked read`}
          reason="There is no bulk endpoint, so each one is a separate call and they do not succeed or fail together. The ones that worked are read; the rest are still listed."
        />
      ) : null}
    </StackLayout>
  );
}
