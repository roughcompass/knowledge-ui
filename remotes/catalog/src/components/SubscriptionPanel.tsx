import { Button, Checkbox, CheckboxGroup, FlexLayout } from '@salt-ds/core';
import {
  EVENT_KINDS,
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptions,
  type EventKind,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import { ActionResult, DataTable, EmptyState, LoadingPanel, SectionCard } from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * Which changes to this capability you hear about.
 *
 * Lives on the capability detail page rather than in a separate remote for the
 * same reason Adopt does: the subscription is *about this capability*, and the
 * reader is already here. A cross-capability subscriptions screen would need a
 * cross-capability list endpoint, which does not exist — subscriptions are read
 * per capability, exactly like adoptions.
 *
 * **Subscribing and adopting are separate, but not symmetrically so.** You may
 * watch a capability you have not adopted. However adopting *does* create a
 * subscription: `AdoptionService` is wired with `subscriptions.adoption_hook()`,
 * and `unadopt` removes only the adoption row. So a row here may exist because
 * someone adopted, not because they subscribed — and it will outlive the
 * adoption. The panel says so rather than letting a reader conclude they
 * subscribed and forgot.
 */
export function SubscriptionPanel({ handle }: { handle: string }) {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const list = useSubscriptions(client, scope, handle);
  const create = useCreateSubscription(client, scope);
  const remove = useDeleteSubscription(client, scope);

  const [selected, setSelected] = useState<EventKind[]>(['version_published']);

  if (list.isPending) {
    return (
      <SectionCard title="Notifications" banded flush>
        <LoadingPanel label="Loading subscriptions" />
      </SectionCard>
    );
  }

  if (list.error) {
    return (
      <SectionCard title="Notifications" banded flush>
        <ActionResult error={list.error} errorTitle="Could not load subscriptions" />
      </SectionCard>
    );
  }

  const rows = (list.data ?? []).map((s) => ({
    id: String(s.subscription_id),
    kinds: (s.event_kinds ?? []).join(', ') || '—',
    enabled: s.is_enabled ? 'Enabled' : 'Disabled',
    delivery: s.webhook_url ? 'Webhook' : 'Inbox',
  }));

  /*
   * The footer band is the card's own slot for "a hint on the left, its action on
   * the right", so the subscribe control lives there rather than stacked under the
   * table. Putting it in the body would give the card two competing action zones.
   */
  const footer = (
    <FlexLayout gap={2} align="center" justify="space-between" wrap>
      <CheckboxGroup
        direction="horizontal"
        checkedValues={selected}
        onChange={(event) => {
          const value = event.target.value as EventKind;
          setSelected((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
          );
        }}
      >
        {EVENT_KINDS.map((kind) => (
          <Checkbox key={kind} value={kind} label={kind.replace(/_/g, ' ')} />
        ))}
      </CheckboxGroup>

      <Button
        appearance="solid"
        sentiment="accented"
        disabled={create.isPending || selected.length === 0}
        onClick={() => create.mutate({ capabilityHandle: handle, event_kinds: selected })}
      >
        {create.isPending ? 'Subscribing…' : 'Subscribe'}
      </Button>
    </FlexLayout>
  );

  return (
    <SectionCard
      title="Notifications"
      // The disclosure belongs in the header's description, not as a note beneath
      // the table: it explains what the rows *are*, so it has to be readable
      // before them rather than after.
      description="Adopting this capability creates an inbox subscription automatically, and unadopting does not remove it. A row here may have come from an adoption rather than from this panel."
      banded
      flush
      footer={footer}
      headingLevel="h3"
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Not subscribed"
          description="You will not be told when this capability changes."
        />
      ) : (
        <DataTable
          zebra
          caption="Subscriptions"
          hideCaption
          columns={[
            { key: 'kinds', header: 'Events' },
            { key: 'delivery', header: 'Delivery' },
            { key: 'enabled', header: 'State' },
            {
              key: 'id',
              header: 'Action',
              render: (row) => (
                <Button
                  appearance="transparent"
                  sentiment="caution"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ subscriptionId: row.id, capabilityHandle: handle })}
                >
                  Cancel
                </Button>
              ),
            },
          ]}
          rows={rows}
          getRowId={(row) => row.id}
        />
      )}

      <ActionResult error={create.error} errorTitle="Could not subscribe" />
      <ActionResult error={remove.error} errorTitle="Could not cancel" />
    </SectionCard>
  );
}
