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
  ConfirmDialog,
  CopyButton,
  DataTable,
  DescriptionList,
  ErrorPanel,
  FormRow,
  KLink,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  StatusLabel,
  UnavailableNotice,
  popoverOverlayProps,
  termText,
  type Column,
} from '@knowledge-ui/ui-kit';
import {
  Button,
  Dropdown,
  FlexLayout,
  Input,
  MultilineInput,
  Option,
  StackLayout,
  Tab,
  TabBar,
  TabList,
  Tabs,
  TabTrigger,
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
  label: 'Catalog Records',
  need: 'catalog:search',
  guidance:
    'Checks canonical capabilities and interfaces. Each match includes the facts that made it relevant.',
  example: 'Which Salt design system components can an agent use?',
};

const SOURCES: readonly SourceOption[] = [
  DEFAULT_SOURCE,
  {
    value: 'claims',
    label: 'Recalled Claims',
    need: 'memory:read',
    guidance:
      'Checks machine-derived claims recalled from memory. Each claim includes confidence and citations.',
    example: 'What depends on design-tokens?',
  },
  {
    value: 'workspaces',
    label: 'Workspace Notes',
    need: 'workspace:read',
    guidance:
      'Checks deliberate notes visible to this identity. Workspace notes are not canonical catalog facts.',
    example: 'What decisions mention the Salt design system?',
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

const WORKSPACE_VIEWS = ['results', 'cases', 'runs'] as const;
type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

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

function defaultCaseName(turn: ProbeTurn): string {
  const task =
    turn.request.query.length > 56 ? `${turn.request.query.slice(0, 53)}...` : turn.request.query;
  return `${sourceOption(turn.request.source).label}: ${task}`;
}

function reviewedCount(turn: ProbeTurn): number {
  if (!turn.result) return 0;
  return turn.result.items.filter(
    (item) => (turn.evaluations[contextProbeItemId(item)] ?? 'unreviewed') !== 'unreviewed',
  ).length;
}

function RegressionComparison({ comparison }: { comparison: ProbeTurn['comparison'] }) {
  if (!comparison) return null;
  return (
    <SectionCard
      title="Baseline Comparison"
      description={`${comparison.saved.name}. This compares record IDs with the saved labels and does not calculate a quality score.`}
    >
      <DescriptionList
        caption={`Baseline comparison for ${comparison.saved.name}`}
        hideCaption
        items={[
          {
            term: 'Expected Results Returned',
            detail: <Text styleAs="code">{idList(comparison.diff.expected_and_returned)}</Text>,
          },
          {
            term: 'Expected Results Missing',
            detail: <Text styleAs="code">{idList(comparison.diff.expected_but_missing)}</Text>,
          },
          {
            term: 'New or Unreviewed Results',
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
  if (cases.length === 0) {
    return (
      <Note label="No Saved Test Cases" variant="neutral">
        Review a run, then save it as a test case. Saved cases remain in this browser tab.
      </Note>
    );
  }

  const columns: ReadonlyArray<Column<SavedContextCase>> = [
    {
      key: 'case',
      header: 'Test Case',
      render: (saved) => (
        <StackLayout gap={0.5}>
          <Text>{saved.name}</Text>
          <Text color="secondary" styleAs="notation">
            {saved.query}
          </Text>
        </StackLayout>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (saved) => (
        <StackLayout gap={0.5}>
          <Text>{sourceOption(saved.source).label}</Text>
          {saved.claim_persona ? (
            <Text color="secondary" styleAs="notation">
              {termText(saved.claim_persona)} claims view
            </Text>
          ) : null}
        </StackLayout>
      ),
    },
    {
      key: 'baseline',
      header: 'Baseline',
      render: (saved) => (
        <StackLayout gap={0.5}>
          <Text>{`${saved.expected_ids.length} included · ${saved.not_expected_ids.length} excluded`}</Text>
          <Text color="secondary" styleAs="notation">
            {saved.missing_context ? 'Missing context recorded' : 'No missing context recorded'}
          </Text>
        </StackLayout>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (saved) => (
        <FlexLayout gap={1} align="center" wrap>
          <Button
            appearance="bordered"
            sentiment="accented"
            disabled={busy}
            onClick={() => onRerun(saved)}
          >
            {runningCaseId === saved.case_id ? 'Running Again…' : 'Run Again'}
          </Button>
          <CopyButton
            value={exportedContextCase(saved)}
            label="Export"
            aria-label={`Export ${saved.name}`}
          />
          <Button
            appearance="transparent"
            sentiment="negative"
            onClick={() => onDelete(saved.case_id)}
          >
            Delete
          </Button>
        </FlexLayout>
      ),
    },
  ];

  return (
    <SectionCard
      title="Saved Test Cases"
      description="Run a saved case after retrieval changes, or export it to keep the baseline."
      flush
    >
      <DataTable
        columns={columns}
        rows={cases}
        getRowId={(saved) => saved.case_id}
        caption="Saved retrieval test cases"
        hideCaption
        zebra
      />
    </SectionCard>
  );
}

function runStatus(turn: ProbeTurn) {
  if (turn.state === 'pending') return <StatusLabel status="info">Running</StatusLabel>;
  if (turn.state === 'error') return <StatusLabel status="error">Failed</StatusLabel>;
  return <StatusLabel status="success">Ready</StatusLabel>;
}

function RunHistory({
  turns,
  selectedTurnId,
  busy,
  onOpen,
  onRerun,
}: {
  turns: readonly ProbeTurn[];
  selectedTurnId?: string;
  busy: boolean;
  onOpen: (turn: ProbeTurn) => void;
  onRerun: (turn: ProbeTurn) => void;
}) {
  if (turns.length === 0) {
    return (
      <Note label="No Runs Yet" variant="neutral">
        Run a task to start a history for this browser session.
      </Note>
    );
  }

  const columns: ReadonlyArray<Column<ProbeTurn>> = [
    {
      key: 'run',
      header: 'Run',
      render: (turn) => (
        <StackLayout gap={0.5}>
          <Text>{turn.request.query}</Text>
          <Text color="secondary" styleAs="notation">
            {sourceOption(turn.request.source).label}
          </Text>
        </StackLayout>
      ),
    },
    { key: 'status', header: 'Status', render: runStatus },
    {
      key: 'records',
      header: 'Records',
      align: 'right',
      render: (turn) => (turn.state === 'success' && turn.result ? turn.result.items.length : '—'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (turn) => (
        <FlexLayout gap={1} align="center" wrap>
          <Button
            appearance="bordered"
            sentiment="neutral"
            disabled={selectedTurnId === turn.id}
            onClick={() => onOpen(turn)}
          >
            {selectedTurnId === turn.id ? 'Viewing' : 'View Results'}
          </Button>
          <Button
            appearance="transparent"
            sentiment="accented"
            disabled={busy}
            onClick={() => onRerun(turn)}
          >
            Run Again
          </Button>
        </FlexLayout>
      ),
    },
  ];

  return (
    <SectionCard
      title="Run History"
      description="Open any run to review its returned records, labels, and baseline comparison."
      flush
    >
      <DataTable
        columns={columns}
        rows={turns}
        getRowId={(turn) => turn.id}
        caption="Retrieval test run history"
        hideCaption
        zebra
      />
    </SectionCard>
  );
}

function ProbeTurnContent({
  turn,
  busy,
  onRunAgain,
  onEvaluation,
  onStartSave,
}: {
  turn: ProbeTurn;
  busy: boolean;
  onRunAgain: () => void;
  onEvaluation: (itemId: string, next: EvaluationMark) => void;
  onStartSave: () => void;
}) {
  const label = sourceOption(turn.request.source).label;
  const claimView = turn.request.claimPersona
    ? ` · ${termText(turn.request.claimPersona)} claims view`
    : '';
  const total = turn.result?.items.length ?? 0;
  const reviewed = reviewedCount(turn);

  return (
    <StackLayout gap={2}>
      <SectionCard
        title={`${label} Results`}
        description={`${turn.request.query}${claimView}`}
        banded
        actions={
          turn.state === 'success' ? (
            <FlexLayout gap={1} align="center" wrap>
              <StatusLabel status={total > 0 && reviewed === total ? 'success' : 'info'}>
                {`${reviewed} of ${total} Reviewed`}
              </StatusLabel>
              {turn.savedAs ? (
                <StatusLabel status="success">{`Saved as ${turn.savedAs}`}</StatusLabel>
              ) : null}
              <Button
                appearance="bordered"
                sentiment="accented"
                disabled={busy}
                onClick={onRunAgain}
              >
                Run Again
              </Button>
              <Button appearance="solid" sentiment="accented" onClick={onStartSave}>
                Save as Test Case
              </Button>
            </FlexLayout>
          ) : undefined
        }
      >
        {turn.state === 'pending' ? <LoadingPanel label={`Testing ${label}`} /> : null}
        {turn.state === 'error' && turn.error ? (
          <ErrorPanel
            title={`${label} test failed`}
            error={turn.error}
            action={
              <Button
                appearance="bordered"
                sentiment="accented"
                disabled={busy}
                onClick={onRunAgain}
              >
                Try Again
              </Button>
            }
          />
        ) : null}
        {turn.state === 'success' && turn.result ? (
          <StackLayout gap={2}>
            <Text color="secondary">
              Use Include and Exclude to review each returned record. Leave a record unreviewed when
              there is not enough evidence to judge it.
            </Text>
            <Suspense fallback={<LoadingPanel label="Preparing test results" />}>
              <ContextProbeResults
                result={turn.result}
                evaluations={turn.evaluations}
                onEvaluation={onEvaluation}
              />
            </Suspense>
          </StackLayout>
        ) : null}
      </SectionCard>
      <RegressionComparison comparison={turn.comparison} />
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
  const [selectedTurnId, setSelectedTurnId] = useState<string>();
  const [activeView, setActiveView] = useState<WorkspaceView>('results');
  const [savingTurnId, setSavingTurnId] = useState<string>();
  const [caseName, setCaseName] = useState('');
  const [caseNameError, setCaseNameError] = useState<string>();
  const [cases, setCases] = useState<SavedContextCase[]>(() => loadSavedContextCases(scope));
  const [storageError, setStorageError] = useState<string>();
  const [runningCaseId, setRunningCaseId] = useState<string>();
  const focusedTurnId = useRef<string>();
  const selected = sourceOption(source);
  const selectedTurn = turns.find((turn) => turn.id === selectedTurnId) ?? turns[0];
  const savingTurn = turns.find((turn) => turn.id === savingTurnId);

  const latestTurn = turns[0];
  const latestAnnouncement = latestTurn
    ? latestTurn.state === 'pending'
      ? `Testing ${sourceOption(latestTurn.request.source).label}.`
      : latestTurn.state === 'success'
        ? `${sourceOption(latestTurn.request.source).label} test completed. Results are ready for review.`
        : `${sourceOption(latestTurn.request.source).label} test failed.`
    : '';

  useEffect(() => {
    const latest = turns[0];
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
    setSelectedTurnId(turnId);
    setActiveView('results');
    setTurns((current) => [
      {
        id: turnId,
        request,
        state: 'pending',
        evaluations: {},
        missingContext: '',
      },
      ...current,
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

  const submitProbe = (text?: string) => {
    const trimmed = (text ?? query).trim();
    if (!trimmed) {
      setQueryError('Enter the agent task this source should retrieve context for.');
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
      setCaseNameError('Name the test case so it can be recognized on a later run.');
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

  const startSaving = (turn: ProbeTurn) => {
    setSavingTurnId(turn.id);
    setCaseName(defaultCaseName(turn));
    setCaseNameError(undefined);
    setStorageError(undefined);
  };

  const closeSaveDialog = () => {
    setSavingTurnId(undefined);
    setCaseName('');
    setCaseNameError(undefined);
    setStorageError(undefined);
  };

  return (
    <StackLayout gap={3}>
      <Text className="salt-visuallyHidden" role="status" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </Text>

      <SectionCard
        title="Test Setup"
        description="One run queries one source and returns stored records, not a generated answer."
        footer={
          <>
            <Text color="secondary">Enter runs the test. Shift+Enter adds a line.</Text>
            <FlexLayout gap={1} align="center" wrap>
              <Button
                appearance="transparent"
                disabled={probe.isPending}
                onClick={() => {
                  setQueryError(undefined);
                  submitProbe(selected.example);
                }}
              >
                Use Example Task
              </Button>
              <Button
                appearance="solid"
                sentiment="accented"
                disabled={probe.isPending}
                onClick={() => submitProbe()}
              >
                {probe.isPending ? 'Running Test…' : 'Run Retrieval Test'}
              </Button>
            </FlexLayout>
          </>
        }
      >
        <StackLayout gap={2}>
          <FlexLayout gap={2} align="start" wrap>
            <FormRow label="Context Source" helperText={selected.guidance}>
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
                label="Claims View"
                helperText="Choose the audience used to filter and explain recalled claims."
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

          <FormRow
            label="Agent Task"
            required
            error={queryError}
            helperText="Describe the real task that should retrieve these records."
          >
            <MultilineInput
              bordered
              rows={3}
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
        </StackLayout>
      </SectionCard>

      <Tabs
        value={activeView}
        onChange={(_event, value) => {
          if (WORKSPACE_VIEWS.includes(value as WorkspaceView)) {
            setActiveView(value as WorkspaceView);
          }
        }}
      >
        <TabBar>
          <TabList>
            <Tab value="results">
              <TabTrigger>Results</TabTrigger>
            </Tab>
            <Tab value="cases">
              <TabTrigger>{`Test Cases (${cases.length})`}</TabTrigger>
            </Tab>
            <Tab value="runs">
              <TabTrigger>{`Run History (${turns.length})`}</TabTrigger>
            </Tab>
          </TabList>
        </TabBar>
      </Tabs>

      {activeView === 'results' ? (
        selectedTurn ? (
          <StackLayout
            as="section"
            gap={2}
            aria-label={`${sourceOption(selectedTurn.request.source).label} test run`}
            id={`context-turn-${selectedTurn.id}`}
            tabIndex={-1}
          >
            <ProbeTurnContent
              turn={selectedTurn}
              busy={probe.isPending}
              onRunAgain={() =>
                void executeProbe(selectedTurn.request, selectedTurn.comparison?.saved)
              }
              onEvaluation={(itemId, next) =>
                updateTurn(selectedTurn.id, (current) => ({
                  ...current,
                  evaluations: { ...current.evaluations, [itemId]: next },
                }))
              }
              onStartSave={() => startSaving(selectedTurn)}
            />
          </StackLayout>
        ) : (
          <Note label="Ready to Test" variant="neutral">
            Choose a source, enter an agent task, and run it. Results will appear here for review.
          </Note>
        )
      ) : null}

      {activeView === 'cases' ? (
        <SavedCases
          cases={cases}
          busy={probe.isPending}
          runningCaseId={runningCaseId}
          onRerun={(saved) => void executeProbe(savedCaseRequest(saved), saved)}
          onDelete={deleteCase}
        />
      ) : null}

      {activeView === 'runs' ? (
        <RunHistory
          turns={turns}
          selectedTurnId={selectedTurn?.id}
          busy={probe.isPending}
          onOpen={(turn) => {
            setSelectedTurnId(turn.id);
            setActiveView('results');
          }}
          onRerun={(turn) => void executeProbe(turn.request, turn.comparison?.saved)}
        />
      ) : null}

      {storageError && !savingTurn ? (
        <ErrorPanel title="Could not update saved test cases" error={new Error(storageError)} />
      ) : null}

      {savingTurn ? (
        <ConfirmDialog
          open
          title="Save as Test Case"
          confirmLabel="Save Test Case"
          error={storageError ? new Error(storageError) : undefined}
          onCancel={closeSaveDialog}
          onConfirm={() => saveTurn(savingTurn)}
        >
          <Text>
            Save this review as a reusable baseline. Included and excluded records are stored with
            the task.
          </Text>
          <FormRow
            label="Test Case Name"
            required
            error={caseNameError}
            helperText="Use a name that will still identify this task after retrieval changes."
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
          <FormRow
            label="Missing Context"
            helperText="Optional. Record anything this source should have returned but did not."
          >
            <MultilineInput
              bordered
              rows={4}
              value={savingTurn.missingContext}
              onChange={(event) =>
                updateTurn(savingTurn.id, (current) => ({
                  ...current,
                  missingContext: (event.target as HTMLTextAreaElement).value,
                }))
              }
            />
          </FormRow>
        </ConfirmDialog>
      ) : null}
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
        eyebrow="Context testing"
        title="Retrieval Tests"
        description="Run an agent task against one context source, review every returned record, and save the result as a regression test."
        actions={
          <KLink to="receipts" color="accent" underline="never">
            Inspect Run Receipt
          </KLink>
        }
      />

      {allowedSources.length > 0 ? (
        <ContextLabSession
          key={`${scope.personaKey}:${scope.tenantSlug}`}
          scope={scope}
          client={client}
          allowedSources={allowedSources}
        />
      ) : (
        <UnavailableNotice
          title="Retrieval tests are not available to this role"
          reason="This identity cannot search any context source used by retrieval tests."
        />
      )}
    </StackLayout>
  );
}
