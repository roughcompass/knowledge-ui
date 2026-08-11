import {
  Button,
  Dropdown,
  FlexLayout,
  Input,
  Option,
  StackLayout,
  Tag,
  Text,
  Tooltip,
} from '@salt-ds/core';
import {
  CursorStack,
  fieldErrors,
  filterSignature,
  formErrors,
  useCreateWorkspace,
  useDeleteWorkspace,
  useWorkspaces,
  type RegistryClient,
  type Workspace,
  type WorkspaceOwnerKind,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  ActionResult,
  ConfirmDialog,
  CursorPager,
  DataTable,
  ErrorPanel,
  FilterBar,
  FilterField,
  FormRow,
  PageHeader,
  SectionCard,
  UnavailableNotice,
  instantText,
  popoverOverlayProps,
  type Column,
  KLink,
} from '@knowledge-ui/ui-kit';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import {
  OWNERSHIP_LABEL,
  OWNERSHIP_MEANING,
  canWriteWorkspace,
  creatableOwnerKinds,
} from '../components/workspaceOwnership';

/**
 * Workspaces: the notebooks kept beside the catalog.
 *
 * A workspace is where the reasoning lives — the note, the decision and the open
 * question that the catalog itself has no field for. Nothing in here is a fact
 * the catalog serves, which is why it is a separate area rather than a tab on a
 * capability.
 *
 * ## Visibility is chosen once, and the page says so
 *
 * `owner_kind` decides who else can read the workspace, and the API fixes it at
 * creation: the PATCH body accepts a name, a description and an archive
 * timestamp, and nothing else. So the choice is made here, in the create form,
 * where it is still a choice — and the detail page names the absence rather than
 * offering a control that would have to fail.
 *
 * ## Which rows appear is the server's answer, not a filter applied here
 *
 * A producer sees their own personal workspaces and every team one; an auditor
 * sees everybody's. The list endpoint decides that per row. This page renders
 * what came back and never filters it further, because a client-side visibility
 * rule would be a second, drifting copy of a boundary that already exists.
 *
 * ## The write controls are per row
 *
 * Ownership decides who may write, not the role on its own — an admin cannot
 * rename someone's personal notebook, and a producer cannot touch the team's. So
 * Delete appears against the rows this session can actually delete, and is absent
 * elsewhere rather than present-and-refused.
 */

interface Draft {
  name: string;
  description: string;
  owner_kind: WorkspaceOwnerKind | '';
}

const EMPTY_DRAFT: Draft = { name: '', description: '', owner_kind: '' };

/** What the archive filter offers, and the query value each choice sends. */
const ARCHIVE_VIEWS = {
  Active: false,
  'Including archived': true,
} as const;

type ArchiveView = keyof typeof ARCHIVE_VIEWS;

export function WorkspacesPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [view, setView] = useState<ArchiveView>('Active');
  const includeArchived = ARCHIVE_VIEWS[view];

  // Same reset rule as every other paged list: a cursor from one result set
  // points at a position in that set, so changing the filter must drop it.
  const signature = filterSignature({ includeArchived });
  const stack = useRef(new CursorStack(signature));
  const [cursor, setCursor] = useState<string | null>(null);
  if (stack.current.syncSignature(signature) && cursor !== null) setCursor(null);

  const allowed = can(session, 'workspace:read');
  const creatable = creatableOwnerKinds(session);

  const query = useWorkspaces(client, scope, { includeArchived, cursor }, { enabled: allowed });
  const create = useCreateWorkspace(client, scope);
  const remove = useDeleteWorkspace(client, scope);

  const [formOpen, setFormOpen] = useState(false);
  // A single-choice list is not a choice. When a session may create exactly one
  // kind — the usual case, since the two grants do not overlap — the form starts
  // on it rather than making the reader pick the only option there is.
  const [draft, setDraft] = useState<Draft>({
    ...EMPTY_DRAFT,
    owner_kind: creatable.length === 1 ? (creatable[0] as WorkspaceOwnerKind) : '',
  });
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const fields = fieldErrors(create.error);
  const formLevel = formErrors(create.error);

  const submit = () => {
    setReceipt(null);
    create.mutate(
      {
        name: draft.name,
        owner_kind: draft.owner_kind as WorkspaceOwnerKind,
        ...(draft.description ? { description: draft.description } : {}),
      },
      {
        onSuccess: (created) => {
          setDraft({
            ...EMPTY_DRAFT,
            owner_kind: creatable.length === 1 ? (creatable[0] as WorkspaceOwnerKind) : '',
          });
          setFormOpen(false);
          setReceipt(`Created ${created.name}. ${OWNERSHIP_MEANING[created.owner_kind]}`);
        },
      },
    );
  };

  const columns: Array<Column<Workspace>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Workspace',
        // The name is the way in, and the only control for it: anything that
        // navigates is an anchor, and a second row action for the same journey
        // reads as two journeys while leaving the real link unmarked.
        render: (row) => (
          <StackLayout gap={0.5}>
            <KLink underline="never" color="accent" to={row.workspace_id}>
              {row.name}
            </KLink>
            {row.description ? <Text color="secondary">{row.description}</Text> : null}
          </StackLayout>
        ),
      },
      {
        key: 'owner_kind',
        header: 'Visibility',
        render: (row) => <Tag>{OWNERSHIP_LABEL[row.owner_kind]}</Tag>,
      },
      {
        key: 'archived_at',
        header: 'State',
        render: (row) =>
          row.archived_at ? (
            // Archived is not deleted and not empty: the entries are still
            // readable, and only writing is refused. Saying "Archived" and when
            // is the whole distinction.
            <Text color="secondary">Archived {instantText(row.archived_at)}</Text>
          ) : (
            <Text color="secondary">Active</Text>
          ),
      },
      {
        key: 'updated_at',
        header: 'Updated',
        render: (row) => <Text color="secondary">{instantText(row.updated_at)}</Text>,
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => (
          <FlexLayout gap={1} justify="end">
            {canWriteWorkspace(session, row) ? (
              <Button
                appearance="transparent"
                sentiment="neutral"
                onClick={() => {
                  setReceipt(null);
                  setDeleting(row);
                }}
              >
                Delete
              </Button>
            ) : null}
          </FlexLayout>
        ),
      },
    ],
    [session],
  );

  const header = (
    <PageHeader
      eyebrow="Workspace memory"
      title="Workspaces"
      description="Keep notes, decisions, and open questions beside the catalog."
      actions={
        creatable.length > 0 ? (
          <Button
            appearance={formOpen ? 'bordered' : 'solid'}
            sentiment="accented"
            onClick={() => setFormOpen((open) => !open)}
          >
            {formOpen ? 'Cancel' : 'New Workspace'}
          </Button>
        ) : (
          /*
            The refusal lives on the control, not in a banner. A disabled button
            in the same place other roles find the working one answers "can I?"
            and "who can?" in one glance — a labeled banner above the list
            answered it as an announcement.
          */
          <Tooltip content="Read-only for your role — producers and admins create workspaces.">
            <Button appearance="solid" sentiment="accented" disabled focusableWhenDisabled>
              New Workspace
            </Button>
          </Tooltip>
        )
      }
    />
  );

  if (!allowed) {
    return (
      <StackLayout gap={3}>
        {header}
        <UnavailableNotice
          title="Workspaces are not available to this role"
          reason="Reading a workspace needs a tenant context this identity does not carry."
        />
      </StackLayout>
    );
  }

  const filters = (
    <FilterBar label="Filter workspaces">
      <FilterField label="Show" basis="14rem">
        <Dropdown
          bordered
          value={view}
          onSelectionChange={(_event, selected) =>
            setView((selected?.[0] as ArchiveView) ?? 'Active')
          }
          OverlayProps={popoverOverlayProps}
        >
          {(Object.keys(ARCHIVE_VIEWS) as ArchiveView[]).map((label) => (
            <Option key={label} value={label}>
              {label}
            </Option>
          ))}
        </Dropdown>
      </FilterField>
    </FilterBar>
  );

  const rows = query.data?.items ?? [];
  const nextCursor = query.data?.next_cursor ?? null;

  return (
    <StackLayout gap={3}>
      {header}

      <ActionResult
        success={receipt ?? undefined}
        error={remove.error}
        errorTitle="That workspace was not deleted"
      />

      {formOpen ? (
        <SectionCard
          title="New workspace"
          banded
          footer={
            <Button
              appearance="solid"
              sentiment="accented"
              disabled={create.isPending}
              onClick={submit}
            >
              {create.isPending ? 'Creating…' : 'Create Workspace'}
            </Button>
          }
        >
          <StackLayout gap={2}>
            {formLevel.length > 0 ? (
              <ErrorPanel error={create.error} title="Could not create this workspace" />
            ) : null}

            <FormRow
              label="Name"
              required
              error={fields.name?.[0]}
              helperText="What this workspace is for. For example, Payments migration."
            >
              <Input
                bordered
                value={draft.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, name: event.target.value }))
                }
              />
            </FormRow>

            <FormRow
              label="Visibility"
              required
              error={fields.owner_kind?.[0]}
              // The sentence a reader most needs before submitting, because this
              // is the one field the API will not let them change afterwards —
              // the update body carries name, description and archive state only.
              helperText={`Chosen once — it cannot be changed after the workspace is created. ${
                draft.owner_kind ? OWNERSHIP_MEANING[draft.owner_kind] : ''
              }`}
            >
              <Dropdown
                bordered
                value={draft.owner_kind ? OWNERSHIP_LABEL[draft.owner_kind] : ''}
                onSelectionChange={(_event, selected) =>
                  setDraft((d) => ({
                    ...d,
                    owner_kind: (selected?.[0] ?? '') as WorkspaceOwnerKind | '',
                  }))
                }
                OverlayProps={popoverOverlayProps}
              >
                {creatable.map((kind) => (
                  <Option key={kind} value={kind}>
                    {OWNERSHIP_LABEL[kind]}
                  </Option>
                ))}
              </Dropdown>
            </FormRow>

            <FormRow
              label="Description"
              error={fields.description?.[0]}
              helperText="Optional. One line about what belongs in here."
            >
              <Input
                bordered
                value={draft.description}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, description: event.target.value }))
                }
              />
            </FormRow>
          </StackLayout>
        </SectionCard>
      ) : null}

      {filters}

      {query.error ? <ErrorPanel error={query.error} title="Could not load workspaces" /> : null}

      {/*
        The table renders while the request is in flight and draws its own
        column-derived skeleton, so the page does not swap a spinner for a table of
        a different height. `rows` is empty until the data lands, which is what
        puts `DataTable` into that state.
      */}
      {!query.error ? (
        <>
          <DataTable
            isLoading={query.isPending}
            card
            zebra
            caption="Workspaces you can see"
            hideCaption
            columns={columns}
            rows={rows}
            getRowId={(row) => row.workspace_id}
            emptyTitle="No workspaces"
            emptyDescription={
              includeArchived
                ? 'Nothing here yet, archived or otherwise.'
                : 'Nothing active. Archived workspaces are hidden — switch the filter to see them.'
            }
          />
          <CursorPager
            showingCount={rows.length}
            isLoading={query.isFetching}
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

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this workspace?"
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete Workspace'}
        busy={remove.isPending}
        error={remove.error}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          remove.mutate(
            { workspaceId: target.workspace_id },
            {
              onSuccess: () => {
                setDeleting(null);
                setReceipt(`Deleted ${target.name}.`);
              },
            },
          );
        }}
      >
        {/*
          Stated plainly because the two halves point in opposite directions: the
          row is soft-deleted server-side, so nothing is shredded — but no screen
          in this application can reach it afterwards, so from here it is gone.
          Archiving is the reversible option and is named so the reader can take
          it instead.
        */}
        <Text>
          {deleting?.name} and its entries stop being readable from here. The contextplane keeps the
          row, but nothing in this application will show it again. Archiving instead keeps it
          readable and stops further writes.
        </Text>
      </ConfirmDialog>
    </StackLayout>
  );
}
