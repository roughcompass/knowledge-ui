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
import {
  DataTable,
  EntityLink,
  ErrorPanel,
  Note,
  StatusLabel,
  displayText,
  isoDay,
  termText,
  type Column,
} from '@knowledge-ui/ui-kit';
import { FlexLayout, StackLayout, Tag, Text, ToggleButton, useBreakpoint } from '@salt-ds/core';
import {
  ThumbsDownIcon,
  ThumbsDownSolidIcon,
  ThumbsUpIcon,
  ThumbsUpSolidIcon,
} from '@salt-ds/icons';

import type { EvaluationMark } from '../contextLabModel';

function EvaluationControls({
  itemId,
  value,
  onChange,
  compact = false,
}: {
  itemId: string;
  value: EvaluationMark;
  onChange: (next: EvaluationMark) => void;
  compact?: boolean;
}) {
  const choose = (next: Exclude<EvaluationMark, 'unreviewed'>) => {
    onChange(value === next ? 'unreviewed' : next);
  };

  const controls = (
    <>
      <ToggleButton
        value="expected"
        selected={value === 'expected'}
        sentiment="positive"
        appearance="bordered"
        aria-label={`Include ${itemId}`}
        onChange={() => choose('expected')}
      >
        {value === 'expected' ? <ThumbsUpSolidIcon aria-hidden /> : <ThumbsUpIcon aria-hidden />}
        Include
      </ToggleButton>
      <ToggleButton
        value="not_expected"
        selected={value === 'not_expected'}
        sentiment="negative"
        appearance="bordered"
        aria-label={`Exclude ${itemId}`}
        onChange={() => choose('not_expected')}
      >
        {value === 'not_expected' ? (
          <ThumbsDownSolidIcon aria-hidden />
        ) : (
          <ThumbsDownIcon aria-hidden />
        )}
        Exclude
      </ToggleButton>
    </>
  );

  return compact ? (
    <StackLayout role="group" aria-label={`Review ${itemId}`} gap={1}>
      {controls}
    </StackLayout>
  ) : (
    <FlexLayout role="group" aria-label={`Review ${itemId}`} gap={1} align="center" wrap>
      {controls}
    </FlexLayout>
  );
}

function SearchEvidence({ citations }: { citations: readonly SearchCitation[] }) {
  if (citations.length === 0) {
    return (
      <Text color="secondary">
        No citations arrived with this result. Treat it as unverifiable.
      </Text>
    );
  }

  return (
    <StackLayout gap={1}>
      {citations.map((citation) => (
        <StackLayout gap={0.5} key={citation.fact_id}>
          <Text>{citation.title ?? citation.category ?? 'Catalog fact'}</Text>
          <Text color="secondary" styleAs="notation">
            <Text styleAs="code">{citation.fact_id}</Text>
            {citation.category ? ` · ${citation.category}` : ''}
            {citation.created_at
              ? ` · recorded ${isoDay(citation.created_at) ?? citation.created_at}`
              : ''}
          </Text>
        </StackLayout>
      ))}
    </StackLayout>
  );
}

function CatalogResults({
  items,
  evaluations,
  onEvaluation,
  compact,
}: {
  items: readonly SearchHit[];
  evaluations: Readonly<Record<string, EvaluationMark>>;
  onEvaluation: (itemId: string, next: EvaluationMark) => void;
  compact: boolean;
}) {
  const record = (hit: SearchHit) => (
    <StackLayout gap={0.5}>
      <EntityLink
        id={hit.entity_id}
        name={hit.name}
        to={`../${encodeURIComponent(hit.entity_id)}`}
      />
      <Text color="secondary" styleAs="notation">
        {termText(hit.entity_type)}
      </Text>
    </StackLayout>
  );
  const match = (hit: SearchHit) => (
    <StackLayout gap={0.5}>
      <Text styleAs="code">{hit.score.toFixed(2)}</Text>
      {hit.retrieval_arms ? (
        <Text color="secondary" styleAs="notation">
          Semantic {hit.retrieval_arms.semantic ?? '—'} · Lexical{' '}
          {hit.retrieval_arms.lexical ?? '—'} · Graph {hit.retrieval_arms.graph ?? '—'}
        </Text>
      ) : null}
    </StackLayout>
  );
  const verdict = (hit: SearchHit) => (
    <EvaluationControls
      itemId={hit.entity_id}
      value={evaluations[hit.entity_id] ?? 'unreviewed'}
      onChange={(next) => onEvaluation(hit.entity_id, next)}
      compact={compact}
    />
  );

  const columns: ReadonlyArray<Column<SearchHit>> = compact
    ? [
        {
          key: 'result',
          header: 'Result',
          render: (hit) => (
            <StackLayout gap={1}>
              {record(hit)}
              {match(hit)}
              <SearchEvidence citations={hit.citations} />
            </StackLayout>
          ),
        },
        { key: 'verdict', header: 'Verdict', render: verdict },
      ]
    : [
        {
          key: 'record',
          header: 'Record',
          render: record,
        },
        {
          key: 'match',
          header: 'Match',
          render: match,
        },
        {
          key: 'evidence',
          header: 'Why It Matched',
          render: (hit) => <SearchEvidence citations={hit.citations} />,
        },
        {
          key: 'verdict',
          header: 'Verdict',
          render: verdict,
        },
      ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      getRowId={(hit) => hit.entity_id}
      caption="Catalog retrieval results"
      hideCaption
      zebra
    />
  );
}

function ClaimEvidence({ claim }: { claim: Claim }) {
  return (
    <StackLayout gap={1}>
      {claim.citations.map((citation) => (
        <StackLayout gap={0.5} key={`${citation.kind}:${citation.ref}`}>
          <Text>
            <Text styleAs="code">{citation.kind}</Text> {citation.ref}
          </Text>
          {citation.excerpt ? (
            <Text color="secondary" styleAs="notation">
              {citation.excerpt}
            </Text>
          ) : null}
        </StackLayout>
      ))}
    </StackLayout>
  );
}

function ClaimResults({
  items,
  evaluations,
  onEvaluation,
  compact,
}: {
  items: readonly Claim[];
  evaluations: Readonly<Record<string, EvaluationMark>>;
  onEvaluation: (itemId: string, next: EvaluationMark) => void;
  compact: boolean;
}) {
  const summary = (claim: Claim) => (
    <StackLayout gap={0.5}>
      <Text>{`${claim.subject_entity_id} · ${claim.predicate}`}</Text>
      <Text color="secondary" styleAs="notation">
        {displayText(claim.value) || 'No value served'}
      </Text>
    </StackLayout>
  );
  const trust = (claim: Claim) => (
    <StackLayout gap={1}>
      <FlexLayout gap={1} align="center" wrap>
        <Tag>{confidenceBand(claim.confidence)}</Tag>
        <Text styleAs="code">{claim.confidence.toFixed(2)}</Text>
      </FlexLayout>
      <StatusLabel status={claim.human_confirmed ? 'success' : 'info'}>
        {claim.human_confirmed ? 'Owner Confirmed' : 'Not Confirmed'}
      </StatusLabel>
      <Text color="secondary" styleAs="notation">
        {termText(claim.claim_category)} · {termText(claim.authority)}
      </Text>
    </StackLayout>
  );
  const verdict = (claim: Claim) => (
    <EvaluationControls
      itemId={claim.claim_id}
      value={evaluations[claim.claim_id] ?? 'unreviewed'}
      onChange={(next) => onEvaluation(claim.claim_id, next)}
      compact={compact}
    />
  );

  const columns: ReadonlyArray<Column<Claim>> = compact
    ? [
        {
          key: 'claim',
          header: 'Claim and Evidence',
          render: (claim) => (
            <StackLayout gap={1}>
              {summary(claim)}
              {trust(claim)}
              <ClaimEvidence claim={claim} />
            </StackLayout>
          ),
        },
        { key: 'verdict', header: 'Verdict', render: verdict },
      ]
    : [
        {
          key: 'claim',
          header: 'Claim',
          render: summary,
        },
        {
          key: 'trust',
          header: 'Trust',
          render: trust,
        },
        {
          key: 'evidence',
          header: 'Evidence',
          render: (claim) => <ClaimEvidence claim={claim} />,
        },
        {
          key: 'verdict',
          header: 'Verdict',
          render: verdict,
        },
      ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      getRowId={(claim) => claim.claim_id}
      caption="Recalled claim results"
      hideCaption
      zebra
    />
  );
}

function WorkspaceResults({
  items,
  evaluations,
  onEvaluation,
  compact,
}: {
  items: readonly WorkspaceEntry[];
  evaluations: Readonly<Record<string, EvaluationMark>>;
  onEvaluation: (itemId: string, next: EvaluationMark) => void;
  compact: boolean;
}) {
  const note = (entry: WorkspaceEntry) => (
    <StackLayout gap={0.5}>
      <Text>{termText(entry.kind)}</Text>
      <Text color="secondary">{entry.body_md}</Text>
    </StackLayout>
  );
  const recorded = (entry: WorkspaceEntry) => (
    <StackLayout gap={0.5}>
      <Text>{isoDay(entry.updated_at) ?? entry.updated_at}</Text>
      <Text color="secondary" styleAs="notation">
        Created {isoDay(entry.created_at) ?? entry.created_at}
      </Text>
    </StackLayout>
  );
  const references = (entry: WorkspaceEntry) =>
    entry.reference_ids.length > 0 ? entry.reference_ids.join(', ') : 'No references served';
  const verdict = (entry: WorkspaceEntry) => (
    <EvaluationControls
      itemId={entry.entry_id}
      value={evaluations[entry.entry_id] ?? 'unreviewed'}
      onChange={(next) => onEvaluation(entry.entry_id, next)}
      compact={compact}
    />
  );

  const columns: ReadonlyArray<Column<WorkspaceEntry>> = compact
    ? [
        {
          key: 'note',
          header: 'Workspace Note',
          render: (entry) => (
            <StackLayout gap={1}>
              {note(entry)}
              {recorded(entry)}
              <Text color="secondary" styleAs="notation">
                {references(entry)}
              </Text>
            </StackLayout>
          ),
        },
        { key: 'verdict', header: 'Verdict', render: verdict },
      ]
    : [
        {
          key: 'note',
          header: 'Workspace Note',
          render: note,
        },
        {
          key: 'recorded',
          header: 'Recorded',
          render: recorded,
        },
        {
          key: 'references',
          header: 'References',
          render: references,
        },
        {
          key: 'verdict',
          header: 'Verdict',
          render: verdict,
        },
      ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      getRowId={(entry) => entry.entry_id}
      caption="Workspace note results"
      hideCaption
      zebra
    />
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
  const { breakpoint } = useBreakpoint();
  const compact = breakpoint === 'xs';

  if (result.items.length === 0) {
    return (
      <Note label="No Records Matched" variant="neutral">
        The source completed the test and returned no records. Reword the task or choose a different
        source. The service did not fail.
      </Note>
    );
  }

  if (result.source === 'catalog') {
    return (
      <CatalogResults
        items={result.items}
        evaluations={evaluations}
        onEvaluation={onEvaluation}
        compact={compact}
      />
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
        <ClaimResults
          items={result.items}
          evaluations={evaluations}
          onEvaluation={onEvaluation}
          compact={compact}
        />
      </StackLayout>
    );
  }

  return (
    <StackLayout gap={2}>
      <Note label="Workspace Scope" variant="neutral">
        These are deliberate notes from workspaces visible to this identity. They are not canonical
        catalog facts.
      </Note>
      <WorkspaceResults
        items={result.items}
        evaluations={evaluations}
        onEvaluation={onEvaluation}
        compact={compact}
      />
    </StackLayout>
  );
}
