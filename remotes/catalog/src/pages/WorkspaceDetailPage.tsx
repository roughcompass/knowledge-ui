import {
  Button,
  Divider,
  Dropdown,
  FlexLayout,
  Input,
  MultilineInput,
  Option,
  StackLayout,
  Text,
  Tooltip,
} from '@salt-ds/core';
import {
  CursorStack,
  WORKSPACE_ENTRY_KINDS,
  fieldErrors,
  filterSignature,
  useCreateWorkspaceEntry,
  useDeleteWorkspaceEntry,
  useUpdateWorkspaceEntry,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaceEntries,
  type RegistryClient,
  type WorkspaceEntry,
  type WorkspaceEntryKind,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  ActionResult,
  ConfirmDialog,
  CursorPager,
  DescriptionList,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterField,
  FormRow,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  StatusLabel,
  UnavailableNotice,
  instantText,
  popoverOverlayProps,
  termText,
  EntityLink,
} from '@knowledge-ui/ui-kit';
import { useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';

import {
  OWNERSHIP_LABEL,
  OWNERSHIP_MEANING,
  canWriteWorkspace,
} from '../components/workspaceOwnership';

/**
 * One workspace, and what is written in it.
 *
 * ## Visibility is a named absence, not a missing control
 *
 * Every product word for this — sharing, permissions, "who can see it" — implies
 * a control, and there is none: `PATCH /v1/workspaces/{id}` accepts `name`,
 * `description` and `archived_at`, and `owner_kind` is not in the body. A
 * disabled dropdown would suggest a permission problem the reader could solve by
 * asking someone; the notice says the API does not express the change at all, and
 * names the one route that does — a new workspace.
 *
 * ## Archived is a third state, between active and deleted
 *
 * The server refuses *entry* writes on an archived workspace and keeps serving
 * its reads; renaming and un-archiving stay open, because the gate on the update
 * route is deliberately archive-state independent — otherwise an archived
 * workspace could never be un-archived. So archiving is offered as the
 * reversible alternative to deleting, and the Add Entry control says why it is
 * gone rather than simply vanishing, which reads as a permission the reader lost.
 *
 * ## Entry bodies are Markdown, and are not rendered as Markdown
 *
 * The field is `body_md` and no renderer is bundled here. Passing raw Markdown
 * through a Markdown renderer is also how a workspace entry becomes an injection
 * surface for whatever wrote it — and this content is authored by agents as often
 * as by people. Paragraphs are split on blank lines so the text is readable, and
 * the marks stay visible as marks, which is the honest rendering of a field
 * nothing here interprets.
 */

const ANY_KIND = 'Any';

function EntryBody({ body }: { body: string }) {
  /*
   * Split on blank lines rather than on every newline: a hard-wrapped paragraph
   * is one paragraph, and breaking it per line would double-space prose that was
   * never meant to be a list.
   */
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <StackLayout gap={1}>
      {paragraphs.map((paragraph, index) => (
        <Text key={index}>{paragraph}</Text>
      ))}
    </StackLayout>
  );
}

function EntryRow({
  entry,
  canWrite,
  onDelete,
  onSave,
  saving,
}: {
  entry: WorkspaceEntry;
  canWrite: boolean;
  onDelete: () => void;
  onSave: (body: string) => void;
  saving: boolean;
}) {
  /*
    Editing in place, because the endpoint has existed the whole time with no
    client. An entry could be created and deleted and never corrected, so fixing a
    typo in a decision record meant deleting it and writing it again — which loses
    the entry's identity and its place in the feed. A workspace is the one surface
    in this console a reader owns outright.
  */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body_md);

  return (
    <StackLayout gap={1.5}>
      <FlexLayout gap={2} align="center" justify="space-between">
        <FlexLayout gap={1} align="center">
          <Text styleAs="h4" as="h3">
            {termText(entry.kind)}
          </Text>
          <Text color="secondary" styleAs="notation">
            {instantText(entry.created_at)}
          </Text>
        </FlexLayout>
        {canWrite ? (
          <FlexLayout gap={1} align="center">
            <Button
              appearance="transparent"
              sentiment="neutral"
              onClick={() => {
                setDraft(entry.body_md);
                setEditing((open) => !open);
              }}
            >
              {editing ? 'Cancel Edit' : 'Edit Entry'}
            </Button>
            <Button appearance="transparent" sentiment="neutral" onClick={onDelete}>
              Delete
            </Button>
          </FlexLayout>
        ) : null}
      </FlexLayout>

      {editing ? (
        <StackLayout gap={1}>
          <MultilineInput
            bordered
            value={draft}
            aria-label="Entry body"
            onChange={(event) => setDraft((event.target as HTMLTextAreaElement).value)}
          />
          <FlexLayout justify="end" gap={1}>
            <Button
              appearance="solid"
              sentiment="accented"
              disabled={saving || draft.trim().length === 0 || draft === entry.body_md}
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </Button>
          </FlexLayout>
        </StackLayout>
      ) : null}

      <StackLayout gap={2}>
        {entry.warnings && entry.warnings.length > 0 ? (
          /*
           * The scanner resolved policy=warn on a field: the entry was stored,
           * and it was stored carrying something that looked personal. The
           * categories are the server's own words and are shown as they arrived.
           */
          <Note label="Possible personal data" variant="warning">
            {entry.warnings
              .map((warning) => `${warning.field}: ${warning.categories.join(', ')}`)
              .join(' · ')}
          </Note>
        ) : null}

        <EntryBody body={entry.body_md} />

        {entry.reference_ids.length > 0 ? (
          <FlexLayout gap={1} align="center" wrap>
            <Text color="secondary" styleAs="label">
              References
            </Text>
            {entry.reference_ids.map((id) => (
              <EntityLink key={id} id={id} to={`../../${id}`} />
            ))}
          </FlexLayout>
        ) : null}

        {entry.expires_at ? (
          <Text color="secondary" styleAs="notation">
            Expires {instantText(entry.expires_at)}
          </Text>
        ) : null}
      </StackLayout>
    </StackLayout>
  );
}

export function WorkspaceDetailPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const workspace = useWorkspace(client, scope, workspaceId);

  const [kind, setKind] = useState<WorkspaceEntryKind | ''>('');
  const signature = filterSignature({ workspaceId, kind });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const entries = useWorkspaceEntries(client, scope, workspaceId, {
    ...(kind ? { kind } : {}),
    cursor,
  });

  const update = useUpdateWorkspace(client, scope);
  const addEntry = useCreateWorkspaceEntry(client, scope);
  const removeEntry = useDeleteWorkspaceEntry(client, scope);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryKind, setEntryKind] = useState<WorkspaceEntryKind>('note');
  const [entryBody, setEntryBody] = useState('');
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<WorkspaceEntry | null>(null);
  const updateEntry = useUpdateWorkspaceEntry(client, scope);
  const [receipt, setReceipt] = useState<string | null>(null);

  /*
    The header outlives the wait.

    This returned a bare spinner, so the page lost its title, its breadcrumb context
    and its heading for as long as the read took — a route that renders no `h1` while
    loading is one an end-to-end sweep can only catch by timing. The capability
    detail page already keeps its header through every state; this now matches it.
  */
  if (workspace.isPending)
    return (
      <StackLayout gap={3}>
        <PageHeader eyebrow="Workspace memory" title="Workspace" />
        <LoadingPanel label="Loading workspace" />
      </StackLayout>
    );

  if (workspace.error) {
    return (
      <StackLayout gap={3}>
        <PageHeader eyebrow="Workspace memory" title="Workspace" />
        {/*
          A workspace nobody may see and a workspace that never existed both
          answer 404, deliberately — the server refuses to let a caller probe for
          the existence of one they cannot read. So the error is rendered as it
          arrived rather than translated into "not found", which would claim to
          know which of the two it was.
        */}
        <ErrorPanel error={workspace.error} title="Could not load this workspace" />
      </StackLayout>
    );
  }

  const ws = workspace.data;
  const archived = Boolean(ws.archived_at);
  const mayWrite = canWriteWorkspace(session, ws);
  // Entries are the only thing archiving stops. Metadata is not gated on archive
  // state server-side — it cannot be, or nothing could ever be un-archived.
  const mayWriteEntries = mayWrite && !archived;
  const entryFields = fieldErrors(addEntry.error);

  // Who can, decided by ownership rather than role alone: a personal workspace
  // is its owning producer's, a team one is an admin's — an admin cannot write
  // in someone's personal workspace and a producer cannot touch the team's.
  const writeRefusal =
    ws.owner_kind === 'tenant'
      ? 'Read-only for your role — an admin can edit a team workspace.'
      : 'Read-only for your role — only the producer who owns a personal workspace can edit it.';
  const entryRefusal = mayWrite
    ? 'Archived — un-archive this workspace to write in it.'
    : writeRefusal;

  const rows = entries.data?.items ?? [];
  const nextCursor = entries.data?.next_cursor ?? null;

  const beginEdit = () => {
    setName(ws.name);
    setDescription(ws.description ?? '');
    setReceipt(null);
    setEditing(true);
  };

  const saveDetails = () => {
    update.mutate(
      {
        workspaceId: ws.workspace_id,
        // `description` is sent even when empty, as null: the API documents null
        // as "clear it", and dropping the key would make clearing a description
        // impossible from this form.
        patch: { name, description: description.trim() === '' ? null : description },
      },
      {
        onSuccess: () => {
          setEditing(false);
          setReceipt('Saved.');
        },
      },
    );
  };

  const toggleArchive = () => {
    setReceipt(null);
    update.mutate(
      {
        workspaceId: ws.workspace_id,
        // Tri-state: a timestamp archives, an explicit null un-archives. Omitting
        // the key would leave the state alone, which is why this is not compacted.
        patch: { archived_at: archived ? null : new Date().toISOString() },
      },
      {
        onSuccess: () =>
          setReceipt(
            archived
              ? 'Un-archived. Writing is allowed again.'
              : 'Archived. It stays readable, and further writes are refused.',
          ),
      },
    );
  };

  const submitEntry = () => {
    setReceipt(null);
    addEntry.mutate(
      { workspaceId: ws.workspace_id, kind: entryKind, body_md: entryBody },
      {
        onSuccess: (created) => {
          setEntryBody('');
          setEntryFormOpen(false);
          setReceipt(
            created.warnings && created.warnings.length > 0
              ? 'Added. The scanner flagged possible personal data — see the entry.'
              : 'Added.',
          );
        },
      },
    );
  };

  return (
    <StackLayout gap={3}>
      <PageHeader
        eyebrow="Workspace memory"
        title={ws.name}
        description={ws.description ?? undefined}
        metadata={
          // No "All workspaces" link: the breadcrumb above already goes there,
          // and two adjacent controls for one journey read as two journeys.
          <FlexLayout gap={1} align="center">
            <Text styleAs="notation" color="secondary">
              {OWNERSHIP_LABEL[ws.owner_kind]}
            </Text>
            {archived ? <StatusLabel status="warning">Archived</StatusLabel> : null}
          </FlexLayout>
        }
        actions={
          mayWrite ? (
            <FlexLayout gap={1}>
              <Button
                appearance="bordered"
                sentiment="neutral"
                disabled={update.isPending}
                onClick={beginEdit}
              >
                Edit Details
              </Button>
              <Button
                appearance="bordered"
                sentiment="neutral"
                disabled={update.isPending}
                onClick={toggleArchive}
              >
                {archived ? 'Un-archive' : 'Archive'}
              </Button>
            </FlexLayout>
          ) : (
            /*
              Refused, not removed. The controls stay where a writer finds the
              working ones, disabled and focusable, with who-can in the tooltip —
              a control that vanishes reads as a permission the reader lost.
            */
            <FlexLayout gap={1}>
              <Tooltip content={writeRefusal}>
                <Button appearance="bordered" sentiment="neutral" disabled focusableWhenDisabled>
                  Edit Details
                </Button>
              </Tooltip>
              <Tooltip content={writeRefusal}>
                <Button appearance="bordered" sentiment="neutral" disabled focusableWhenDisabled>
                  {archived ? 'Un-archive' : 'Archive'}
                </Button>
              </Tooltip>
            </FlexLayout>
          )
        }
      />

      <ActionResult
        success={receipt ?? undefined}
        error={update.error ?? removeEntry.error}
        errorTitle="That change was not saved"
      />

      {archived ? (
        <Note label="Archived">
          Nothing more can be written in here. The contextplane refuses new entries while a
          workspace is archived, and everything already written stays readable.
          {mayWrite
            ? ' The name and description can still be corrected, and un-archiving reopens it.'
            : ''}
        </Note>
      ) : null}

      <SectionCard title="About this workspace">
        <StackLayout gap={2}>
          <DescriptionList
            caption="Workspace details"
            hideCaption
            items={[
              {
                term: 'Visibility',
                detail: `${OWNERSHIP_LABEL[ws.owner_kind]} — ${OWNERSHIP_MEANING[ws.owner_kind]}`,
              },
              {
                term: 'State',
                detail: archived ? `Archived ${instantText(ws.archived_at as string)}` : 'Active',
              },
              { term: 'Created', detail: instantText(ws.created_at) },
              { term: 'Last updated', detail: instantText(ws.updated_at) },
            ]}
          />

          {mayWrite ? (
            /*
              Only for a reader who can edit, because it explains the shape of the
              edit form — the one control they might come looking for. A reader
              with no write access has no missing control to be told about.

              The absence is the API's shape, not a permission: the update body
              carries name, description and archive state, and owner_kind is not
              in it, so no session could send the change. Said in the reader's
              words on screen so nobody goes asking for a grant that cannot help.
            */
            <UnavailableNotice
              title="Visibility cannot be changed after creation"
              reason="Who can see this workspace was decided when it was created, and no edit here can change it."
              tracking="To move content between a personal and a team workspace, create the other kind and add the entries to it."
            />
          ) : null}
        </StackLayout>
      </SectionCard>

      {editing ? (
        <SectionCard
          title="Edit details"
          banded
          footer={
            <FlexLayout gap={1}>
              <Button
                appearance="transparent"
                sentiment="neutral"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                appearance="solid"
                sentiment="accented"
                disabled={update.isPending}
                onClick={saveDetails}
              >
                {update.isPending ? 'Saving…' : 'Save Details'}
              </Button>
            </FlexLayout>
          }
        >
          <StackLayout gap={2}>
            <FormRow label="Name" required>
              <Input
                bordered
                value={name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              />
            </FormRow>
            <FormRow label="Description" helperText="Leave empty to clear it.">
              <Input
                bordered
                value={description}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDescription(event.target.value)
                }
              />
            </FormRow>
          </StackLayout>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Entries"
        description="Notes, decisions, open questions and saved queries written in this workspace."
        actions={
          mayWriteEntries ? (
            <Button
              appearance={entryFormOpen ? 'bordered' : 'solid'}
              sentiment="accented"
              onClick={() => setEntryFormOpen((open) => !open)}
            >
              {entryFormOpen ? 'Cancel' : 'Add Entry'}
            </Button>
          ) : (
            // Same rule as the header actions: the refusal lives on the control.
            // The tooltip distinguishes "your role cannot" from "this workspace
            // is archived", which call for different next steps.
            <Tooltip content={entryRefusal}>
              <Button appearance="solid" sentiment="accented" disabled focusableWhenDisabled>
                Add Entry
              </Button>
            </Tooltip>
          )
        }
      >
        <StackLayout gap={2}>
          {entryFormOpen ? (
            <StackLayout gap={2}>
              {addEntry.error ? (
                <ErrorPanel error={addEntry.error} title="Could not add this entry" />
              ) : null}

              <FormRow
                label="Kind"
                required
                error={entryFields.kind?.[0]}
                helperText="What this is, so it can be found by type later."
              >
                <Dropdown
                  bordered
                  value={termText(entryKind)}
                  onSelectionChange={(_event, selected) =>
                    setEntryKind((selected?.[0] as WorkspaceEntryKind) ?? 'note')
                  }
                  OverlayProps={popoverOverlayProps}
                >
                  {WORKSPACE_ENTRY_KINDS.map((value) => (
                    <Option key={value} value={value}>
                      {termText(value)}
                    </Option>
                  ))}
                </Dropdown>
              </FormRow>

              <FormRow
                label="Body"
                required
                error={entryFields.body_md?.[0]}
                helperText="Markdown. It is stored as written and shown as written — nothing here renders the marks."
              >
                <MultilineInput
                  bordered
                  rows={6}
                  value={entryBody}
                  onChange={(event) => setEntryBody((event.target as HTMLTextAreaElement).value)}
                />
              </FormRow>

              <FlexLayout gap={2} align="center" justify="space-between">
                <Text color="secondary" styleAs="notation">
                  Bodies are scanned for personal data before they are stored.
                </Text>
                <Button
                  appearance="solid"
                  sentiment="accented"
                  disabled={addEntry.isPending}
                  onClick={submitEntry}
                >
                  {addEntry.isPending ? 'Adding…' : 'Add Entry'}
                </Button>
              </FlexLayout>

              <Divider variant="tertiary" />
            </StackLayout>
          ) : null}

          <FilterBar label="Filter entries">
            <FilterField label="Kind" basis="14rem">
              <Dropdown
                bordered
                value={kind ? termText(kind) : ANY_KIND}
                onSelectionChange={(_event, selected) => {
                  const next = selected?.[0] ?? '';
                  setKind(next === ANY_KIND ? '' : (next as WorkspaceEntryKind));
                }}
                OverlayProps={popoverOverlayProps}
              >
                <Option value={ANY_KIND}>{ANY_KIND}</Option>
                {WORKSPACE_ENTRY_KINDS.map((value) => (
                  <Option key={value} value={value}>
                    {termText(value)}
                  </Option>
                ))}
              </Dropdown>
            </FilterField>
          </FilterBar>

          {entries.isPending ? <LoadingPanel label="Loading entries" /> : null}

          {entries.error ? (
            <ErrorPanel error={entries.error} title="Could not load the entries" />
          ) : null}

          {!entries.isPending && !entries.error ? (
            <>
              {rows.length === 0 ? (
                <EmptyState
                  headingLevel="h3"
                  title="Nothing written yet"
                  description={
                    kind
                      ? 'No entries of this kind. Clear the filter to see the rest.'
                      : mayWriteEntries
                        ? 'A workspace starts empty. Add a note, a decision or an open question.'
                        : 'A workspace starts empty, and nothing has been written in this one.'
                  }
                />
              ) : (
                <StackLayout gap={3} separators>
                  {rows.map((entry) => (
                    <EntryRow
                      key={entry.entry_id}
                      onSave={(body) =>
                        updateEntry.mutate({
                          workspaceId: workspaceId as string,
                          entryId: entry.entry_id,
                          body_md: body,
                        })
                      }
                      saving={updateEntry.isPending}
                      entry={entry}
                      canWrite={mayWriteEntries}
                      onDelete={() => {
                        setReceipt(null);
                        setDeletingEntry(entry);
                      }}
                    />
                  ))}
                </StackLayout>
              )}

              <CursorPager
                showingCount={rows.length}
                isLoading={entries.isFetching}
                canPrev={stack.current.canGoBack}
                canNext={nextCursor !== null}
                onPrev={() => setCursor(stack.current.pop())}
                onNext={() => {
                  stack.current.push(cursor);
                  setCursor(nextCursor);
                }}
              />
            </>
          ) : null}
        </StackLayout>
      </SectionCard>

      <ConfirmDialog
        open={deletingEntry !== null}
        title="Delete this entry?"
        confirmLabel={removeEntry.isPending ? 'Deleting…' : 'Delete Entry'}
        busy={removeEntry.isPending}
        error={removeEntry.error}
        onCancel={() => setDeletingEntry(null)}
        onConfirm={() => {
          const target = deletingEntry;
          if (!target) return;
          removeEntry.mutate(
            { workspaceId: ws.workspace_id, entryId: target.entry_id },
            {
              onSuccess: () => {
                setDeletingEntry(null);
                setReceipt('Entry deleted.');
              },
            },
          );
        }}
      >
        <Text>
          This {deletingEntry ? termText(deletingEntry.kind).toLowerCase() : 'entry'} stops being
          readable from here. Entries are not versioned, so there is nothing to restore it from.
        </Text>
      </ConfirmDialog>
    </StackLayout>
  );
}
