import {
  CLAIM_PERSONAS,
  DEFAULT_CLAIM_PERSONA,
  contextProbeItemId,
  type ClaimPersona,
  type ContextProbeRequest,
  type ContextProbeResult,
  type ContextProbeSource,
  type KeyScope,
  type RegistryClient,
  useContextProbe,
} from '@knowledge-ui/api-client';
import { can, useSession, type Capability } from '@knowledge-ui/auth';
import {
  CopyButton,
  DescriptionList,
  ErrorPanel,
  FormRow,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  popoverOverlayProps,
  termText,
  KLink,
} from '@knowledge-ui/ui-kit';
import {
  Button,
  Dropdown,
  FlexLayout,
  Input,
  MultilineInput,
  Option,
  StackLayout,
  Tag,
  Text,
} from '@salt-ds/core';
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  createSavedContextCase,
  diffSavedContextCase,
  exportedContextCase,
  loadSavedContextCases,
  savedCaseRequest,
  storeSavedContextCases,
  type ContextCaseDiff,
  type EvaluationMark,
  type SavedContextCase,
} from '../contextLabModel';

const ContextProbeResults = lazy(async () => {
  const page = await import('./ContextProbeResults');
  return { default: page.ContextProbeResults };
});

interface SourceOption {
  value: ContextProbeSource;
  label: string;
  need: Capability;
  guidance: string;
  example: string;
}

const DEFAULT_SOURCE: SourceOption = {
  value: 'catalog',
  label: 'Catalog',
  need: 'catalog:search',
  guidance: 'Search canonical catalog entities and the cited facts that made each result match.',
  example: 'Salt design system components',
};

const SOURCES: readonly SourceOption[] = [
  DEFAULT_SOURCE,
  {
    value: 'claims',
    label: 'Claims',
    need: 'memory:read',
    guidance:
      'Search recalled, machine-derived claims. Confidence and citations travel with every result.',
    example: 'depends_on design-tokens',
  },
  {
    value: 'workspaces',
    label: 'Workspaces',
    need: 'workspace:read',
    guidance:
      'Search deliberate notes in workspaces visible to this identity. These are not catalog facts.',
    example: 'Salt design system',
  },
] as const;

interface ProbeTurn {
  id: string;
  request: ContextProbeRequest;
  state: 'pending' | 'success' | 'error';
  result?: ContextProbeResult;
  error?: Error;
  evaluations: Record<string, EvaluationMark>;
  missingContext: string;
  comparison?: {
    saved: SavedContextCase;
    diff: ContextCaseDiff;
  };
  savedAs?: string;
}

function newTurnId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sourceOption(source: ContextProbeSource): SourceOption {
  return SOURCES.find((option) => option.value === source) ?? DEFAULT_SOURCE;
}

function errorFrom(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function idList(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'None';
}

function RegressionComparison({ comparison }: { comparison: ProbeTurn['comparison'] }) {
  if (!comparison) return null;
  return (
    <SectionCard
      title={`Regression Check · ${comparison.saved.name}`}
      description="Set differences use the evaluator labels saved with the baseline. They are not a quality score."
    >
      <DescriptionList
        caption={`Regression comparison for ${comparison.saved.name}`}
        hideCaption
        items={[
          {
            term: 'Expected and Returned',
            detail: <Text styleAs="code">{idList(comparison.diff.expected_and_returned)}</Text>,
          },
          {
            term: 'Expected but Missing',
            detail: <Text styleAs="code">{idList(comparison.diff.expected_but_missing)}</Text>,
          },
          {
            term: 'New or Unreviewed',
            detail: <Text styleAs="code">{idList(comparison.diff.new_or_unreviewed)}</Text>,
          },
        ]}
      />
    </SectionCard>
  );
}

function SavedCases({
  cases,
  busy,
  runningCaseId,
  onRerun,
  onDelete,
}: {
  cases: readonly SavedContextCase[];
  busy: boolean;
  runningCaseId?: string;
  onRerun: (saved: SavedContextCase) => void;
  onDelete: (caseId: string) => void;
}) {
  return (
    <StackLayout gap={2}>
      <StackLayout gap={1}>
        <Text as="h2" styleAs="h3">
          Saved Regression Cases
        </Text>
        <Text color="secondary">
          Cases stay in this tab and this persona only. Copy the JSON to keep one beyond the
          session.
        </Text>
      </StackLayout>

      {cases.length === 0 ? (
        <Text color="secondary">
          No cases saved in this tab. Evaluate a completed probe to create one.
        </Text>
      ) : (
        cases.map((saved) => (
          <SectionCard
            key={saved.case_id}
            title={saved.name}
            description={`${sourceOption(saved.source).label} · ${saved.query}`}
            action={
              <FlexLayout gap={1} align="center" wrap>
                <CopyButton
                  value={exportedContextCase(saved)}
                  label="Copy Evaluation"
                  aria-label={`Copy Evaluation ${saved.name}`}
                />
                <Button
                  appearance="bordered"
                  sentiment="accented"
                  disabled={busy}
                  onClick={() => onRerun(saved)}
                >
                  {runningCaseId === saved.case_id ? 'Rerunning Case…' : 'Rerun Case'}
                </Button>
                <Button
                  appearance="transparent"
                  sentiment="caution"
                  onClick={() => onDelete(saved.case_id)}
                >
                  Delete Case
                </Button>
              </FlexLayout>
            }
          >
            <DescriptionList
              caption={`Saved fields for ${saved.name}`}
              hideCaption
              items={[
                {
                  term: 'Expected IDs',
                  detail: <Text styleAs="code">{idList(saved.expected_ids)}</Text>,
                },
                {
                  term: 'Not Expected IDs',
                  detail: <Text styleAs="code">{idList(saved.not_expected_ids)}</Text>,
                },
                {
                  term: 'Missing Context',
                  detail: saved.missing_context || 'Nothing recorded',
                },
              ]}
            />
          </SectionCard>
        ))
      )}
    </StackLayout>
  );
}

function ContextLabSession({
  scope,
  client,
  allowedSources,
}: {
  scope: KeyScope;
  client: RegistryClient;
  allowedSources: readonly SourceOption[];
}) {
  const probe = useContextProbe(client);
  const [source, setSource] = useState<ContextProbeSource>(allowedSources[0]?.value ?? 'catalog');
  const [claimPersona, setClaimPersona] = useState<ClaimPersona>(DEFAULT_CLAIM_PERSONA);
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState<string>();
  const [turns, setTurns] = useState<ProbeTurn[]>([]);
  const [savingTurnId, setSavingTurnId] = useState<string>();
  const [caseName, setCaseName] = useState('');
  const [caseNameError, setCaseNameError] = useState<string>();
  const [cases, setCases] = useState<SavedContextCase[]>(() => loadSavedContextCases(scope));
  const [storageError, setStorageError] = useState<string>();
  const [runningCaseId, setRunningCaseId] = useState<string>();
  const focusedTurnId = useRef<string>();
  const selected = sourceOption(source);

  const latestTurn = turns[turns.length - 1];
  const latestAnnouncement = latestTurn
    ? latestTurn.state === 'pending'
      ? `Probing ${sourceOption(latestTurn.request.source).label}.`
      : latestTurn.state === 'success'
        ? `${sourceOption(latestTurn.request.source).label} probe completed. Context is ready for review.`
        : `${sourceOption(latestTurn.request.source).label} probe failed.`
    : '';

  useEffect(() => {
    const latest = turns[turns.length - 1];
    if (!latest || latest.state === 'pending' || focusedTurnId.current === latest.id) return;
    focusedTurnId.current = latest.id;
    document.getElementById(`context-turn-${latest.id}`)?.focus();
  }, [turns]);

  const updateTurn = (turnId: string, update: (current: ProbeTurn) => ProbeTurn) => {
    setTurns((current) => current.map((turn) => (turn.id === turnId ? update(turn) : turn)));
  };

  const executeProbe = async (request: ContextProbeRequest, saved?: SavedContextCase) => {
    const turnId = newTurnId();
    if (saved) setRunningCaseId(saved.case_id);
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        request,
        state: 'pending',
        evaluations: {},
        missingContext: '',
      },
    ]);

    try {
      const result = await probe.mutateAsync(request);
      const returnedIds = result.items.map(contextProbeItemId);
      updateTurn(turnId, (turn) => ({
        ...turn,
        state: 'success',
        result,
        ...(saved ? { comparison: { saved, diff: diffSavedContextCase(saved, returnedIds) } } : {}),
      }));
    } catch (cause) {
      updateTurn(turnId, (turn) => ({ ...turn, state: 'error', error: errorFrom(cause) }));
    } finally {
      if (saved) setRunningCaseId(undefined);
    }
  };

  const submitProbe = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setQueryError('Enter the task or query this source should retrieve context for.');
      return;
    }
    setQueryError(undefined);
    void executeProbe({
      source,
      query: trimmed,
      ...(source === 'claims' ? { claimPersona } : {}),
    });
    setQuery('');
  };

  const saveTurn = (turn: ProbeTurn) => {
    if (!turn.result) return;
    const trimmedName = caseName.trim();
    if (!trimmedName) {
      setCaseNameError('Name the regression case so it can be recognized on a rerun.');
      return;
    }

    const saved = createSavedContextCase({
      name: trimmedName,
      request: turn.request,
      evaluations: turn.evaluations,
      missingContext: turn.missingContext,
      returnedIds: turn.result.items.map(contextProbeItemId),
      scope,
    });
    const next = [...cases, saved];
    if (!storeSavedContextCases(scope, next)) {
      setStorageError('This browser did not allow the case to be stored for the current tab.');
      return;
    }

    updateTurn(turn.id, (current) => ({ ...current, savedAs: saved.name }));
    setCases(next);
    setSavingTurnId(undefined);
    setCaseName('');
    setCaseNameError(undefined);
    setStorageError(undefined);
  };

  const deleteCase = (caseId: string) => {
    const next = cases.filter((saved) => saved.case_id !== caseId);
    if (!storeSavedContextCases(scope, next)) {
      setStorageError('This browser did not allow the saved case to be removed.');
      return;
    }
    setCases(next);
    setStorageError(undefined);
  };

  return (
    <StackLayout gap={3}>
      <Text className="salt-visuallyHidden" role="status" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </Text>

      <section aria-label="Context probe transcript">
        <StackLayout gap={3}>
          {turns.length === 0 ? (
            <SectionCard
              title="No Probes Yet"
              description="Start with one source and a realistic task. Each completed turn remains an immutable retrieval snapshot."
            >
              <Text color="secondary">
                Reformulate the next message or switch sources to inspect a different retrieval
                contract.
              </Text>
            </SectionCard>
          ) : null}

          {turns.map((turn) => {
            const label = sourceOption(turn.request.source).label;
            return (
              <section
                aria-label={`${label} probe turn`}
                id={`context-turn-${turn.id}`}
                key={turn.id}
                tabIndex={-1}
              >
                <StackLayout gap={2}>
                  <SectionCard
                    title="You Asked"
                    description={`${label} probe${
                      turn.request.claimPersona
                        ? ` · ${termText(turn.request.claimPersona)} persona`
                        : ''
                    }`}
                  >
                    <Text>{turn.request.query}</Text>
                  </SectionCard>

                  {turn.state === 'pending' ? <LoadingPanel label={`Probing ${label}`} /> : null}
                  {turn.state === 'error' && turn.error ? (
                    <ErrorPanel title={`${label} probe failed`} error={turn.error} />
                  ) : null}
                  {turn.state === 'success' && turn.result ? (
                    <StackLayout gap={2}>
                      <FlexLayout gap={2} align="center" justify="space-between" wrap>
                        <StackLayout gap={0.5}>
                          <Text as="h2" styleAs="h3">
                            Context Layer Returned
                          </Text>
                          <Text color="secondary">
                            Exact records from the selected source, not a generated answer.
                          </Text>
                        </StackLayout>
                        <Tag>{label}</Tag>
                      </FlexLayout>

                      <Suspense fallback={<LoadingPanel label="Preparing probe results" />}>
                        <ContextProbeResults
                          result={turn.result}
                          evaluations={turn.evaluations}
                          onEvaluation={(itemId, next) =>
                            updateTurn(turn.id, (current) => ({
                              ...current,
                              evaluations: { ...current.evaluations, [itemId]: next },
                            }))
                          }
                        />
                      </Suspense>

                      <RegressionComparison comparison={turn.comparison} />

                      <SectionCard
                        title="Evaluate This Probe"
                        description="Label individual records above, then record context the source should have returned but did not."
                      >
                        <StackLayout gap={2}>
                          <FormRow
                            label="Missing Context"
                            helperText="Qualitative evaluator evidence. It is not converted into a score."
                          >
                            <MultilineInput
                              bordered
                              rows={3}
                              value={turn.missingContext}
                              onChange={(event) =>
                                updateTurn(turn.id, (current) => ({
                                  ...current,
                                  missingContext: (event.target as HTMLTextAreaElement).value,
                                }))
                              }
                            />
                          </FormRow>

                          {turn.savedAs ? (
                            <Note label="Case Saved" variant="success">
                              {turn.savedAs} is available in this tab for this persona.
                            </Note>
                          ) : null}

                          {savingTurnId === turn.id ? (
                            <StackLayout gap={2}>
                              <FormRow
                                label="Case Name"
                                required
                                error={caseNameError}
                                helperText="Use a task and source name that will still make sense on a later rerun."
                              >
                                <Input
                                  bordered
                                  value={caseName}
                                  onChange={(event) => {
                                    setCaseName((event.target as HTMLInputElement).value);
                                    setCaseNameError(undefined);
                                  }}
                                />
                              </FormRow>
                              <FlexLayout gap={1} align="center" justify="end" wrap>
                                <Button
                                  appearance="transparent"
                                  onClick={() => {
                                    setSavingTurnId(undefined);
                                    setCaseName('');
                                    setCaseNameError(undefined);
                                  }}
                                >
                                  Cancel Save
                                </Button>
                                <Button
                                  appearance="solid"
                                  sentiment="accented"
                                  onClick={() => saveTurn(turn)}
                                >
                                  Save Regression Case
                                </Button>
                              </FlexLayout>
                            </StackLayout>
                          ) : (
                            <FlexLayout justify="end">
                              <Button
                                appearance="bordered"
                                sentiment="accented"
                                onClick={() => {
                                  setSavingTurnId(turn.id);
                                  setCaseName('');
                                  setCaseNameError(undefined);
                                }}
                              >
                                Save Regression Case
                              </Button>
                            </FlexLayout>
                          )}
                        </StackLayout>
                      </SectionCard>
                    </StackLayout>
                  ) : null}
                </StackLayout>
              </section>
            );
          })}
        </StackLayout>
      </section>

      <SectionCard
        title="Probe the Context Layer"
        description="Send one source-specific message. Press Enter to run it, or Shift+Enter for a new line."
      >
        <StackLayout gap={2}>
          <FlexLayout gap={2} align="start" wrap>
            <FormRow label="Source" helperText={selected.guidance}>
              <Dropdown
                bordered
                value={selected.label}
                onSelectionChange={(_event, values) => {
                  const next = values?.[0];
                  if (allowedSources.some((option) => option.value === next)) {
                    setSource(next as ContextProbeSource);
                    setQueryError(undefined);
                  }
                }}
                OverlayProps={popoverOverlayProps}
              >
                {allowedSources.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Dropdown>
            </FormRow>

            {source === 'claims' ? (
              <FormRow
                label="Claim Persona"
                helperText="Controls the retrieval depth the claims endpoint serves."
              >
                <Dropdown
                  bordered
                  value={termText(claimPersona)}
                  onSelectionChange={(_event, values) => {
                    const next = values?.[0];
                    if (CLAIM_PERSONAS.includes(next as ClaimPersona)) {
                      setClaimPersona(next as ClaimPersona);
                    }
                  }}
                  OverlayProps={popoverOverlayProps}
                >
                  {CLAIM_PERSONAS.map((persona) => (
                    <Option key={persona} value={persona}>
                      {termText(persona)}
                    </Option>
                  ))}
                </Dropdown>
              </FormRow>
            ) : null}
          </FlexLayout>

          <FormRow label="Task or Query" required error={queryError} helperText={selected.guidance}>
            <MultilineInput
              bordered
              rows={4}
              value={query}
              placeholder={selected.example}
              onChange={(event) => {
                setQuery((event.target as HTMLTextAreaElement).value);
                setQueryError(undefined);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitProbe();
                }
              }}
            />
          </FormRow>

          <FlexLayout gap={1} align="center" justify="space-between" wrap>
            <Button
              appearance="transparent"
              onClick={() => {
                setQuery(selected.example);
                setQueryError(undefined);
              }}
            >
              Try {selected.label} Example
            </Button>
            <Button
              appearance="solid"
              sentiment="accented"
              disabled={probe.isPending}
              onClick={submitProbe}
            >
              {probe.isPending ? 'Probing Context…' : 'Probe Context'}
            </Button>
          </FlexLayout>
        </StackLayout>
      </SectionCard>

      {storageError ? (
        <ErrorPanel title="Could not update saved cases" error={new Error(storageError)} />
      ) : null}

      <SavedCases
        cases={cases}
        busy={probe.isPending}
        runningCaseId={runningCaseId}
        onRerun={(saved) => void executeProbe(savedCaseRequest(saved), saved)}
        onDelete={deleteCase}
      />
    </StackLayout>
  );
}

export function ContextLabPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowedSources = SOURCES.filter((source) => can(session, source.need));

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Context Lab"
        description="Test whether one retrieval source supplies the evidence an agent needs for a concrete task."
        actions={<KLink to="receipts">Inspect ARC Receipt</KLink>}
      />
      <Note label="Retrieval Test" variant="neutral">
        This tests retrieval context, not answer quality. The registry returns evidence; it does not
        generate the agent’s answer.
      </Note>

      {allowedSources.length > 0 ? (
        <ContextLabSession
          key={`${scope.personaKey}:${scope.tenantSlug}`}
          scope={scope}
          client={client}
          allowedSources={allowedSources}
        />
      ) : (
        <ErrorPanel
          title="Context probes are not available to this role"
          error={new Error('This identity cannot search any retrieval source exposed by the lab.')}
        />
      )}
    </StackLayout>
  );
}
