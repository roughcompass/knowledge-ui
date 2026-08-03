import { Button, Dropdown, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  NOTIFICATION_STATUSES,
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
  LoadingPanel,
  PageHeader,
  popoverOverlayProps,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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

  const header = (
    <PageHeader
      title="Notifications"
      description="Changes to the capabilities your tenant subscribes to. Open the capability to see what changed — these entries carry the fact of a change, not its contents."
    />
  );

  const filters = (
    <FilterBar label="Filter notifications">
      <FilterField label="Show" basis="11rem">
        <Dropdown
          bordered
          value={status}
          onSelectionChange={(_e, selected) =>
            setStatus((selected?.[0] as NotificationStatus) ?? 'unread')
          }
          OverlayProps={popoverOverlayProps}
        >
          {NOTIFICATION_STATUSES.map((value) => (
            <Option key={value} value={value}>
              {value}
            </Option>
          ))}
        </Dropdown>
      </FilterField>
    </FilterBar>
  );

  if (query.isPending) {
    return (
      <StackLayout gap={3}>
        {header}
        {filters}
        <LoadingPanel label="Loading notifications" />
      </StackLayout>
    );
  }

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

      <DataTable
        zebra
        caption="Notifications"
        columns={[
          {
            key: 'slug',
            header: 'Capability',
            // Linking out is the whole mechanism for "what changed" — the payload
            // does not carry it, by design.
            render: (row) => <Link to={`../${encodeURIComponent(row.slug)}`}>{row.slug}</Link>,
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
          { key: 'occurred', header: 'When' },
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
                  Mark read
                </Button>
              ),
          },
        ]}
        rows={rows}
        getRowId={(row) => row.id}
      />

      {markRead.error ? (
        <ErrorPanel error={markRead.error} title="Could not mark that read" />
      ) : null}
    </StackLayout>
  );
}
