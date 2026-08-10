import {
  type Claim,
  type ContextProbeResult,
  type SearchCitation,
  type SearchHit,
  type WorkspaceEntry,
  confidenceBand,
  recallCaveat,
  uncitedClaims,
} from '@knowledge-ui/api-client';
import { Dropdown, FlexLayout, Option, StackLayout, Tag, Text } from '@salt-ds/core';

import type { EvaluationMark } from '../contextLabModel';
import {
  DescriptionList,
  EmptyState,
  ErrorPanel,
  Note,
  SectionCard,
  displayText,
  isoDay,
  termText,
  EntityLink,
} from '@knowledge-ui/ui-kit';

const EVALUATION_OPTIONS: ReadonlyArray<{ value: EvaluationMark; label: string }> = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'expected', label: 'Expected' },
  { value: 'not_expected', label: 'Not Expected' },
];

function evaluationLabel(mark: EvaluationMark): string {
  return EVALUATION_OPTIONS.find((option) => option.value === mark)?.label ?? 'Unreviewed';
}

function EvaluationSelect({
  itemId,
  value,
  onChange,
}: {
  itemId: string;
  value: EvaluationMark;
  onChange: (next: EvaluationMark) => void;
}) {
  return (
    <StackLayout gap={0.5}>
      <Text color="secondary" styleAs="label">
        Evaluation
      </Text>
      <Dropdown
        bordered
        aria-label={`Evaluation for ${itemId}`}
        value={evaluationLabel(value)}
        onSelectionChange={(_event, selected) => {
          const next = selected?.[0];
          if (next && EVALUATION_OPTIONS.some((option) => option.value === next)) {
            onChange(next as EvaluationMark);
          }
        }}
      >
        {EVALUATION_OPTIONS.map((option) => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
      </Dropdown>
    </StackLayout>
  );
}

function SearchEvidence({ citations }: { citations: readonly SearchCitation[] }) {
  if (citations.length === 0) {
    return (
      <Text color="secondary">
        No citations arrived with this search hit. Treat the result as unverifiable.
      </Text>
    );
  }

  return (
    <StackLayout gap={1}>
      {citations.map((citation) => (
        <StackLayout gap={0.5} key={citation.fact_id}>
          <Text>
            {citation.title ?? citation.category ?? 'Catalog fact'} ·{' '}
            <Text styleAs="code">{citation.fact_id}</Text>
          </Text>
          <Text color="secondary" styleAs="label">
            {citation.category ?? 'uncategorized'}
            {citation.created_at
              ? ` · recorded ${isoDay(citation.created_at) ?? citation.created_at}`
              : ''}
            {citation._links?.self ? ` · ${citation._links.self}` : ''}
          </Text>
        </StackLayout>
      ))}
    </StackLayout>
  );
}

function CatalogResultCard({
  hit,
  evaluation,
  onEvaluation,
}: {
  hit: SearchHit;
  evaluation: EvaluationMark;
  onEvaluation: (next: EvaluationMark) => void;
}) {
  const arms = hit.retrieval_arms;
  return (
    <SectionCard
      title={hit.name}
      description={hit.entity_type}
      actions={
        <EvaluationSelect itemId={hit.entity_id} value={evaluation} onChange={onEvaluation} />
      }
    >
      <StackLayout gap={2}>
        <DescriptionList
          caption={`Retrieval metadata for ${hit.name}`}
          hideCaption
          items={[
            {
              term: 'Entity ID',
              /*
                The id, shortened, with the whole value one keystroke away. This
                rendered the full thirty-six characters as the link text while the
                capability's name sat in the card title directly above it — so the
                longest string in the row carried the least information in it.
              */
              detail: (
                <EntityLink id={hit.entity_id} to={`../${encodeURIComponent(hit.entity_id)}`} />
              ),
            },
            { term: 'Server Relevance', detail: hit.score.toFixed(2) },
            ...(arms
              ? [
                  {
                    term: 'Retrieval Arms',
                    detail: (
                      <Text>
                        Semantic {arms.semantic ?? '—'} · Lexical {arms.lexical ?? '—'} · Graph{' '}
                        {arms.graph ?? '—'}
                      </Text>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <StackLayout gap={1}>
          <Text as="h3" styleAs="label">
            Evidence
          </Text>
          <SearchEvidence citations={hit.citations} />
        </StackLayout>
      </StackLayout>
    </SectionCard>
  );
}

function ClaimEvidence({ claim }: { claim: Claim }) {
  return (
    <StackLayout gap={1}>
      {claim.citations.map((citation) => (
        <Text color="secondary" key={`${citation.kind}:${citation.ref}`}>
          <Text styleAs="code">{citation.kind}</Text> {citation.ref}
          {citation.excerpt ? ` — ${citation.excerpt}` : ''}
        </Text>
      ))}
    </StackLayout>
  );
}

function ClaimResultCard({
  claim,
  evaluation,
  onEvaluation,
}: {
  claim: Claim;
  evaluation: EvaluationMark;
  onEvaluation: (next: EvaluationMark) => void;
}) {
  return (
    <SectionCard
      title={`${claim.subject_entity_id} · ${claim.predicate}`}
      description={displayText(claim.value) || 'No value served'}
      actions={
        <EvaluationSelect itemId={claim.claim_id} value={evaluation} onChange={onEvaluation} />
      }
    >
      <StackLayout gap={2}>
        <DescriptionList
          caption={`Claim metadata for ${claim.claim_id}`}
          hideCaption
          items={[
            { term: 'Claim ID', detail: <Text styleAs="code">{claim.claim_id}</Text> },
            {
              term: 'Extractor Confidence',
              detail: (
                <FlexLayout gap={1} align="center">
                  <Tag>{confidenceBand(claim.confidence)}</Tag>
                  <Text>{claim.confidence.toFixed(2)}</Text>
                </FlexLayout>
              ),
            },
            {
              term: 'Owner Confirmed',
              detail: claim.human_confirmed ? 'Confirmed' : 'Not confirmed',
            },
            { term: 'Category', detail: claim.claim_category },
            { term: 'Authority', detail: claim.authority },
            {
              term: 'Valid',
              detail: `${isoDay(claim.valid_from) ?? 'Unknown'} → ${
                claim.valid_to ? (isoDay(claim.valid_to) ?? claim.valid_to) : 'still holds'
              }`,
            },
            { term: 'Last Seen', detail: isoDay(claim.as_of) ?? claim.as_of },
          ]}
        />
        <StackLayout gap={1}>
          <Text as="h3" styleAs="label">
            Evidence
          </Text>
          <ClaimEvidence claim={claim} />
        </StackLayout>
      </StackLayout>
    </SectionCard>
  );
}

function WorkspaceResultCard({
  entry,
  evaluation,
  onEvaluation,
}: {
  entry: WorkspaceEntry;
  evaluation: EvaluationMark;
  onEvaluation: (next: EvaluationMark) => void;
}) {
  return (
    <SectionCard
      title={termText(entry.kind)}
      description={entry.body_md}
      actions={
        <EvaluationSelect itemId={entry.entry_id} value={evaluation} onChange={onEvaluation} />
      }
    >
      <DescriptionList
        caption={`Workspace entry metadata for ${entry.entry_id}`}
        hideCaption
        items={[
          { term: 'Entry ID', detail: <Text styleAs="code">{entry.entry_id}</Text> },
          { term: 'Workspace ID', detail: <Text styleAs="code">{entry.workspace_id}</Text> },
          {
            term: 'References',
            detail:
              entry.reference_ids.length > 0
                ? entry.reference_ids.join(', ')
                : 'No references served',
          },
          { term: 'Created', detail: isoDay(entry.created_at) ?? entry.created_at },
          { term: 'Updated', detail: isoDay(entry.updated_at) ?? entry.updated_at },
        ]}
      />
    </SectionCard>
  );
}

export function ContextProbeResults({
  result,
  evaluations,
  onEvaluation,
}: {
  result: ContextProbeResult;
  evaluations: Readonly<Record<string, EvaluationMark>>;
  onEvaluation: (itemId: string, next: EvaluationMark) => void;
}) {
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No Context Matched This Probe"
        description="The selected source completed the query and returned no records. Reformulate the query or probe a different source; this is not a service failure."
      />
    );
  }

  if (result.source === 'catalog') {
    return (
      <StackLayout gap={2}>
        {result.items.map((hit) => (
          <CatalogResultCard
            key={hit.entity_id}
            hit={hit}
            evaluation={evaluations[hit.entity_id] ?? 'unreviewed'}
            onEvaluation={(next) => onEvaluation(hit.entity_id, next)}
          />
        ))}
      </StackLayout>
    );
  }

  if (result.source === 'claims') {
    const caveat = recallCaveat(result.items);
    const uncited = uncitedClaims(result.items);
    return (
      <StackLayout gap={2}>
        {caveat ? (
          <Note label="Recalled Content" variant="warning">
            {caveat}
          </Note>
        ) : null}
        {uncited.length > 0 ? (
          <ErrorPanel
            title="Some claims arrived without evidence"
            error={
              new Error(
                `${uncited.length} claim(s) carry no citations. They remain visible for diagnosis but are not presented as verified evidence.`,
              )
            }
          />
        ) : null}
        {result.items.map((claim) => (
          <ClaimResultCard
            key={claim.claim_id}
            claim={claim}
            evaluation={evaluations[claim.claim_id] ?? 'unreviewed'}
            onEvaluation={(next) => onEvaluation(claim.claim_id, next)}
          />
        ))}
      </StackLayout>
    );
  }

  return (
    <StackLayout gap={2}>
      <Note label="Workspace Scope" variant="neutral">
        These are deliberate notes from workspaces visible to this identity. They are not canonical
        catalog facts.
      </Note>
      {result.items.map((entry) => (
        <WorkspaceResultCard
          key={entry.entry_id}
          entry={entry}
          evaluation={evaluations[entry.entry_id] ?? 'unreviewed'}
          onEvaluation={(next) => onEvaluation(entry.entry_id, next)}
        />
      ))}
    </StackLayout>
  );
}
