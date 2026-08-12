import {
  type ArcReceipt,
  type ArcReceiptEvent,
  type ArcSelectedDirective,
} from '@knowledge-ui/api-client';
import {
  DescriptionList,
  EmptyState,
  SectionCard,
  StatusLabel,
  displayText,
  instantText,
  termText,
} from '@knowledge-ui/ui-kit';
import { StackLayout, Text } from '@salt-ds/core';

function reasonText(reasons: readonly string[]): string {
  return reasons.length > 0 ? reasons.map(termText).join(', ') : 'None recorded';
}

function sourceText(value: string | null, redacted: boolean): string {
  if (redacted) return 'Redacted by audience policy';
  return value ?? 'Not recorded';
}

function SelectedDirective({ selected }: { selected: ArcSelectedDirective }) {
  return (
    <SectionCard
      title={selected.directive_id}
      description={`${selected.is_mandatory ? 'Mandatory' : 'Optional'} · ${
        selected.was_omitted ? 'omitted from the bundle' : 'selected for the bundle'
      }`}
      actions={
        selected.audience_redacted ? (
          <StatusLabel status="warning">Source Redacted</StatusLabel>
        ) : undefined
      }
    >
      <DescriptionList
        caption={`Selected directive ${selected.directive_id}`}
        hideCaption
        items={[
          { term: 'Artifact ID', detail: <Text styleAs="code">{selected.artifact_id}</Text> },
          { term: 'Revision ID', detail: <Text styleAs="code">{selected.revision_id}</Text> },
          { term: 'Omission Reason', detail: selected.omission_reason ?? 'Not omitted' },
          {
            term: 'Source Locator',
            detail: sourceText(selected.source_locator, selected.audience_redacted),
          },
          {
            term: 'Revision Locator',
            detail: sourceText(selected.source_revision_locator, selected.audience_redacted),
          },
          {
            term: 'Content Digest',
            detail: sourceText(selected.content_digest, selected.audience_redacted),
          },
        ]}
      />
    </SectionCard>
  );
}

function ReceiptEvent({ event }: { event: ArcReceiptEvent }) {
  return (
    <SectionCard
      title={`${event.sequence}. ${termText(event.event_type)}`}
      description={`${termText(event.event_source)} · ${instantText(event.created_at)}`}
    >
      <DescriptionList
        caption={`Event ${event.sequence}`}
        hideCaption
        items={[
          {
            term: 'Recorded Payload',
            detail: <Text styleAs="code">{displayText(event.payload)}</Text>,
          },
        ]}
      />
    </SectionCard>
  );
}

function ReceiptOverview({ receipt }: { receipt: ArcReceipt }) {
  return (
    <SectionCard
      title="Resolution Record"
      description="The retained identity, selection configuration, outcome, and byte budget for this run."
      actions={
        <StatusLabel
          status={
            receipt.resolution_status === 'ready'
              ? 'success'
              : receipt.resolution_status === 'degraded'
                ? 'warning'
                : 'info'
          }
        >
          {termText(receipt.resolution_status)}
        </StatusLabel>
      }
    >
      <DescriptionList
        caption="Resolution record"
        hideCaption
        items={[
          { term: 'Receipt ID', detail: <Text styleAs="code">{receipt.receipt_id}</Text> },
          { term: 'Evaluated', detail: instantText(receipt.evaluated_at) },
          { term: 'Integrity', detail: termText(receipt.integrity_state) },
          { term: 'Host ID', detail: receipt.host_id ?? 'Not recorded' },
          { term: 'Session ID', detail: receipt.session_id ?? 'Not recorded' },
          { term: 'Actor ID', detail: <Text styleAs="code">{receipt.actor_id}</Text> },
          { term: 'Attestation ID', detail: receipt.attestation_id ?? 'Not recorded' },
          {
            term: 'Manifest Fingerprint',
            detail: <Text styleAs="code">{receipt.manifest_fingerprint}</Text>,
          },
          { term: 'Selection Engine', detail: receipt.selection_engine_version },
          { term: 'Registry Revision', detail: receipt.registry_build_revision },
          {
            term: 'Selection Config Digest',
            detail: <Text styleAs="code">{receipt.selection_config_digest}</Text>,
          },
          {
            term: 'Canonical Profiles',
            detail: <Text styleAs="code">{displayText(receipt.canonical_profile_versions)}</Text>,
          },
          {
            term: 'Freshness Basis',
            detail: displayText(receipt.freshness_basis) || 'Not recorded',
          },
          { term: 'Blocked Reasons', detail: reasonText(receipt.blocked_reasons) },
          { term: 'Degraded Reasons', detail: reasonText(receipt.degraded_reasons) },
          { term: 'Mandatory Directives', detail: String(receipt.mandatory_directive_count) },
          { term: 'Rendered Content Bytes', detail: String(receipt.rendered_content_bytes) },
          { term: 'Budget Limit Bytes', detail: String(receipt.budget_limit_bytes) },
        ]}
      />
    </SectionCard>
  );
}

export function ArcReceiptDetails({
  receipt,
  events,
}: {
  receipt: ArcReceipt;
  events?: readonly ArcReceiptEvent[];
}) {
  return (
    <StackLayout gap={3}>
      <ReceiptOverview receipt={receipt} />

      <StackLayout gap={2}>
        <StackLayout gap={1}>
          <Text as="h2" styleAs="h3">
            Selected Directives
          </Text>
          <Text color="secondary">
            Non-source fields remain visible when audience policy redacts locators and digests.
          </Text>
        </StackLayout>
        {receipt.selected.length > 0 ? (
          receipt.selected.map((selected) => (
            <SelectedDirective key={selected.directive_id} selected={selected} />
          ))
        ) : (
          <EmptyState
            title="No Directives Selected"
            description="The retained receipt contains no selected-directive rows. Read the status and reason codes above before interpreting the absence."
            headingLevel="h3"
          />
        )}
      </StackLayout>

      {events ? (
        <StackLayout gap={2}>
          <StackLayout gap={1}>
            <Text as="h2" styleAs="h3">
              Event Chain
            </Text>
            <Text color="secondary">
              Recorded history from the receipt explanation endpoint, in sequence order.
            </Text>
          </StackLayout>
          {events.length > 0 ? (
            events.map((event) => <ReceiptEvent key={event.sequence} event={event} />)
          ) : (
            <EmptyState
              title="No Receipt Events Recorded"
              description="The explanation endpoint returned an empty event chain. The resolution record above remains available."
              headingLevel="h3"
            />
          )}
        </StackLayout>
      ) : null}
    </StackLayout>
  );
}
