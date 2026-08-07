import { StackLayout, Tag, Text } from '@salt-ds/core';
import { useCurationQueue, type RegistryClient } from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  EntityLink,
  ErrorPanel,
  KLink,
  Note,
  PageHeader,
  SectionCard,
  UnavailableNotice,
  displayText,
  instantText,
  termText,
} from '@knowledge-ui/ui-kit';

/**
 * What needs a curator's attention.
 *
 * The registry ships a full curation runbook — work the queue, review promotions,
 * configure auto-promotion — and none of it had a surface here. The memory-steward
 * persona, whose stated question is "is curation producing claims owners accept",
 * was served by one read-only claims list. This is the first page for that job.
 *
 * **Read-only, and it says so rather than implying it.** The queue's actions are
 * writes against untrusted observations: linking an unlinked claim to a subject,
 * discarding one, adjudicating a contested pair. Each needs a capability entry read
 * from the router and a confirmation naming the effect, and inventing either would
 * be the kind of guess this repo's authorization rules exist to prevent. A steward
 * can see the backlog now; acting on it is the next piece of work, not a missing
 * button.
 */
export function CurationQueuePage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const allowed = can(session, 'memory:read');
  const query = useCurationQueue(client, scope, {}, { enabled: allowed });

  const items = Array.isArray((query.data ?? {}).items)
    ? ((query.data as Record<string, unknown>).items as Array<Record<string, unknown>>)
    : [];

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Curation queue"
        description="Observations waiting on a curator: claims whose subject never resolved, and pairs that disagree."
        actions={<KLink to="../claims">All Claims</KLink>}
      />

      {!allowed ? (
        <UnavailableNotice
          title="The curation queue is not readable by this role"
          reason="Reading staged observations requires the memory read capability, which this identity does not hold."
        />
      ) : (
        <>
          <Note label="Read-only view">
            The queue can be read here and not worked. Linking, discarding and adjudicating are
            writes against untrusted observations, and each needs its own authorization entry and a
            confirmation that names the effect — so they are deliberately absent rather than offered
            and refused by the server.
          </Note>

          {query.error ? (
            <ErrorPanel title="Curation queue not available" error={query.error} />
          ) : null}

          <SectionCard
            title="Waiting on a curator"
            description="Each row is an observation the registry could not resolve on its own."
            banded
            flush
          >
            <DataTable
              caption="Curation queue"
              hideCaption
              zebra
              isLoading={query.isPending}
              hasError={Boolean(query.error)}
              columns={[
                {
                  key: 'reason',
                  header: 'Reason',
                  render: (row) => <Tag>{termText(displayText(row.reason ?? 'unknown'))}</Tag>,
                },
                {
                  key: 'claim_id',
                  header: 'Claim',
                  render: (row) =>
                    row.claim_id ? (
                      <EntityLink
                        id={displayText(row.claim_id)}
                        to={`../claims/${displayText(row.claim_id)}`}
                      />
                    ) : (
                      <Text color="secondary">—</Text>
                    ),
                },
                {
                  key: 'subject_ref',
                  header: 'Subject',
                  render: (row) => (
                    <Text color="secondary">{displayText(row.subject_ref ?? 'Unresolved')}</Text>
                  ),
                },
                {
                  key: 'staged_at',
                  header: 'Staged',
                  figures: 'tabular' as const,
                  render: (row) => <Text>{instantText(row.staged_at)}</Text>,
                },
              ]}
              rows={items}
              getRowId={(row, index) => displayText(row.claim_id ?? index)}
              emptyTitle="Nothing Waiting"
              emptyDescription="No observation in this tenant currently needs a curator. That is the queue being empty, not the queue being unavailable — staged claims arrive here only when the registry cannot resolve them on its own."
              emptyHeadingLevel="h3"
            />
          </SectionCard>
        </>
      )}
    </StackLayout>
  );
}
