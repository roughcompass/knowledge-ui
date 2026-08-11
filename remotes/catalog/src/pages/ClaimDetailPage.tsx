import { FlexLayout, StackLayout, StatusIndicator, Tag, Text } from '@salt-ds/core';
import { useClaim, type RegistryClient } from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  DescriptionList,
  EntityLink,
  ErrorPanel,
  KLink,
  LoadingPanel,
  PageHeader,
  SectionCard,
  displayText,
  instantText,
  termText,
} from '@knowledge-ui/ui-kit';
import { useParams } from 'react-router-dom';

/**
 * One claim, and the evidence under it.
 *
 * `useClaim` was typed and exported and no route rendered it — its own docstring says
 * it exists "for the citation drill-in", and there was no page to drill into. So the
 * claims browser listed evidence counts that could not be opened: a reader could see
 * that a claim had three citations and had no way to read one.
 *
 * The whole point of this page is the citations. A served claim is required to carry
 * them — the contextplane refuses to return one without — so a claim rendering no
 * citations here is a contract violation worth seeing rather than an empty table to
 * pass over, and the empty state says exactly that.
 */
export function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const query = useClaim(client, scope, claimId);

  const header = (
    <PageHeader
      eyebrow="Capability catalog"
      title="Claim"
      description="One recalled observation, its subject, and the evidence recorded under it."
      actions={<KLink to="../claims">All Claims</KLink>}
    />
  );

  if (query.isPending)
    return (
      <StackLayout gap={3}>
        {header}
        <LoadingPanel label="Reading the claim" />
      </StackLayout>
    );

  if (query.error)
    return (
      <StackLayout gap={3}>
        {header}
        <ErrorPanel title="Claim not available" error={query.error} />
      </StackLayout>
    );

  const claim = (query.data ?? {}) as Record<string, unknown>;
  const citations = Array.isArray(claim.citations)
    ? (claim.citations as Array<Record<string, unknown>>)
    : [];

  const subject = typeof claim.subject_entity_id === 'string' ? claim.subject_entity_id : undefined;

  return (
    <StackLayout gap={3}>
      {header}

      <SectionCard
        title="Statement"
        description="What this claim asserts, about which subject, and over what interval."
        banded
      >
        <DescriptionList
          caption="Statement"
          hideCaption
          items={[
            {
              term: 'Subject',
              detail: subject ? (
                <EntityLink id={subject} to={`../${subject}`} />
              ) : (
                // An unlinked claim is a real state the curation queue exists to
                // resolve, not a missing field.
                <Text color="secondary">Unlinked — no subject resolved</Text>
              ),
            },
            { term: 'Predicate', detail: <Text>{displayText(claim.predicate)}</Text> },
            { term: 'Value', detail: <Text>{displayText(claim.value)}</Text> },
            {
              term: 'Trust',
              // A caution, not a category. In the same calm pill as the Kind
              // tags it reads as one more classification, and "untrusted" is
              // the one value on the page a reader must not skim past.
              detail: (
                <FlexLayout gap={1} align="center">
                  <StatusIndicator status="warning" />
                  <Text>{displayText(claim.trust ?? 'untrusted')}</Text>
                </FlexLayout>
              ),
            },
            { term: 'Valid From', detail: <Text>{instantText(claim.valid_from)}</Text> },
            { term: 'Valid To', detail: <Text>{instantText(claim.valid_to)}</Text> },
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Citations"
        // The contract-violation explanation lives in the empty state, which is
        // the only place it is true: a card of healthy rows led with
        // "violation" reads as a warning about the evidence it introduces.
        description="The evidence this claim was staged from. Every claim the contextplane serves arrives with its citations."
        banded
        flush
      >
        <DataTable
          caption="Citations"
          hideCaption
          zebra
          columns={[
            { key: 'kind', header: 'Kind', render: (row) => <Tag>{displayText(row.kind)}</Tag> },
            {
              key: 'excerpt',
              header: 'Excerpt',
              render: (row) => <Text>{displayText(row.excerpt)}</Text>,
            },
            {
              key: 'recorded_at',
              header: 'Recorded',
              figures: 'tabular' as const,
              render: (row) => <Text>{instantText(row.recorded_at)}</Text>,
            },
          ]}
          rows={citations}
          getRowId={(row, index) => displayText(row.citation_id ?? index)}
          emptyTitle="No Citations Returned"
          emptyDescription="Every served claim is required to carry its evidence, so this is a defect in the response rather than a claim that happens to have none. Worth reporting with the claim id."
          emptyHeadingLevel="h3"
        />
      </SectionCard>

      <SectionCard title="Record" description="How this claim is identified." banded>
        <DescriptionList
          caption="Record"
          hideCaption
          items={['claim_id', 'category', 'confidence', 'authority']
            .filter((key) => key in claim)
            .map((key) => ({
              term: termText(key),
              detail: <Text>{displayText(claim[key])}</Text>,
            }))}
        />
      </SectionCard>
    </StackLayout>
  );
}
