import {
  Banner,
  BannerContent,
  Button,
  Dropdown,
  FlexLayout,
  Input,
  Option,
  StackLayout,
  StatusIndicator,
  Text,
} from '@salt-ds/core';
import {
  SYNC_SOURCE_TYPES,
  fieldErrors,
  formErrors,
  useCreateSyncSource,
  usePatchSyncSource,
  useSyncSources,
  useTriggerSync,
  type RegistryClient,
  type SyncSource,
  type SyncSourceType,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  ActionResult,
  ConfirmDialog,
  DataTable,
  ErrorPanel,
  FormRow,
  PageHeader,
  SectionCard,
  popoverOverlayProps,
  termText,
  type Column,
} from '@knowledge-ui/ui-kit';
import { useMemo, useState, type ChangeEvent } from 'react';

/**
 * Sync connectors: what feeds the catalog from upstream, and the controls for it.
 *
 * The first write surface in this application, so it is also where the write
 * conventions are demonstrated rather than described. Four of them:
 *
 *   - **Run now has no confirmation.** It is the intended action of the page, the
 *     server makes it idempotent by key, and 202 is not destructive. Guarding the
 *     thing people came here to do behind a modal is friction, not safety.
 *   - **Deactivate does have one**, because it stops scheduled ingestion and the
 *     effect is invisible from this table until something downstream goes stale.
 *     It is also reversible, which makes it the right place to learn the pattern.
 *   - **The receipt is not a link.** `trigger` answers with a `sync_run_id` minted
 *     for the response only; the run row is written later by the scheduler, so that
 *     id resolves to a 404. The banner names the source and the runs list is
 *     refetched — the run appears when it exists.
 *   - **Both halves of a 422 are rendered.** Field errors land on their control;
 *     `path: null` items go above the form. The second kind is what an unknown
 *     connector type produces, and what a credential the connector cannot reach
 *     produces — `connector.validate()` runs inside the create request, so a create
 *     can fail on something no field is responsible for.
 */

interface Draft {
  display_name: string;
  source_type: SyncSourceType | '';
  schedule: string;
  credentials_ref: string;
}

const EMPTY_DRAFT: Draft = {
  display_name: '',
  source_type: '',
  schedule: '',
  credentials_ref: '',
};

export function SyncSourcesPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  /*
   * `activeOnly: false` is load-bearing, not a default being restated. The endpoint
   * is `active_only: bool = Query(True)`, so omitting it hides every deactivated
   * source — which would make the Reactivate control below unreachable and turn the
   * confirm dialog's "reversible from this table" into a lie.
   */
  const sources = useSyncSources(client, scope, { activeOnly: false });
  const trigger = useTriggerSync(client, scope);
  const create = useCreateSyncSource(client, scope);
  const patch = usePatchSyncSource(client, scope);

  /*
   * One draft object in one piece of state. No form library: five fields, two of
   * them required, is not where a schema validator earns its bundle size — and
   * ui-kit is bundled into each remote rather than shared, so that cost is paid
   * per remote. Revisit at the first form with conditional or nested fields.
   */
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<SyncSource | null>(null);
  const [triggered, setTriggered] = useState<string | null>(null);

  const fields = fieldErrors(create.error);
  const formLevel = formErrors(create.error);

  const submit = () => {
    setTriggered(null);
    create.mutate(
      {
        display_name: draft.display_name,
        source_type: draft.source_type,
        // Absent rather than empty: the server treats `''` as a value.
        ...(draft.schedule ? { schedule: draft.schedule } : {}),
        ...(draft.credentials_ref ? { credentials_ref: draft.credentials_ref } : {}),
      },
      {
        onSuccess: (created) => {
          setDraft(EMPTY_DRAFT);
          setFormOpen(false);
          setTriggered(`Added ${created.display_name}. It will run on its schedule.`);
        },
      },
    );
  };

  const columns: Array<Column<SyncSource>> = useMemo(
    () => [
      {
        key: 'display_name',
        header: 'Source',
        render: (row) => (
          <FlexLayout gap={1} align="center">
            <StatusIndicator status={row.is_active ? 'success' : 'warning'} />
            <Text>{row.display_name}</Text>
          </FlexLayout>
        ),
      },
      {
        key: 'source_type',
        header: 'Connector',
        render: (row) => <Text>{termText(row.source_type)}</Text>,
      },
      {
        key: 'schedule',
        header: 'Schedule',
        render: (row) =>
          row.schedule ? (
            <Text styleAs="code">{row.schedule}</Text>
          ) : (
            // A source with no schedule is not broken — it is manual-only, which
            // is a different fact from "not configured yet".
            <Text color="secondary">manual only</Text>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => (
          <FlexLayout gap={1} justify="end">
            <Button
              appearance="bordered"
              sentiment="neutral"
              // An inactive source is refused with a 409, so the control says so
              // up front rather than letting the reader discover it.
              disabled={!row.is_active || trigger.isPending}
              onClick={() => {
                setTriggered(null);
                trigger.mutate(
                  { sourceId: row.source_id },
                  {
                    onSuccess: () => setTriggered(`Queued a manual run of ${row.display_name}.`),
                  },
                );
              }}
            >
              Run Now
            </Button>
            {row.is_active ? (
              <Button
                appearance="transparent"
                sentiment="neutral"
                onClick={() => setDeactivating(row)}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                appearance="transparent"
                sentiment="neutral"
                disabled={patch.isPending}
                onClick={() => {
                  setTriggered(null);
                  patch.mutate(
                    { sourceId: row.source_id, patch: { is_active: true } },
                    { onSuccess: () => setTriggered(`Reactivated ${row.display_name}.`) },
                  );
                }}
              >
                Reactivate
              </Button>
            )}
          </FlexLayout>
        ),
      },
    ],
    [trigger, patch],
  );

  return (
    <StackLayout gap={3}>
      <PageHeader
        eyebrow="Platform operations"
        title="Sync connectors"
        description="Each connector mirrors an upstream source into the catalog as read-only facts. Authored facts always win over synced ones."
        actions={
          <Button
            appearance={formOpen ? 'bordered' : 'solid'}
            sentiment="accented"
            onClick={() => setFormOpen((open) => !open)}
          >
            {formOpen ? 'Cancel' : 'Add Source'}
          </Button>
        }
      />

      {/* The receipt for whatever last happened, above the table it affected. */}
      <ActionResult
        success={triggered ?? undefined}
        error={trigger.error ?? patch.error}
        errorTitle="That action did not work"
      />

      {formOpen ? (
        <SectionCard
          title="New source"
          banded
          footer={
            <>
              <Text color="secondary" styleAs="notation">
                The connector validates its credentials before the source is saved, so this can take
                a moment.
              </Text>
              <Button
                appearance="solid"
                sentiment="accented"
                disabled={create.isPending}
                onClick={submit}
              >
                {create.isPending ? 'Saving…' : 'Save Connector'}
              </Button>
            </>
          }
        >
          <StackLayout gap={2}>
            {/*
              Form-level messages first. These are the items the server sent with no
              `path` — an unknown connector type, or a credential the connector could
              not reach — and there is no field to attach them to.
            */}
            {formLevel.length > 0 ? (
              /*
                A plain Banner, not `ErrorPanel`. `ErrorPanel` duck-types the error it
                is given and looks for `items` — handing it a hand-built `{errors: []}`
                envelope made it fall through to `String(error)` and render
                "[object Object]". These are already extracted strings, so there is
                nothing left for it to normalise.
              */
              <Banner status="error" role="alert">
                <BannerContent>
                  <StackLayout gap={1}>
                    <Text styleAs="label">Could not save this source</Text>
                    {formLevel.map((message) => (
                      <Text key={message}>{message}</Text>
                    ))}
                  </StackLayout>
                </BannerContent>
              </Banner>
            ) : null}

            {/*
              No placeholders on these controls, and the examples live in the helper
              text instead.
              
              Salt renders a placeholder in `--salt-content-secondary-foreground` at
              full opacity — rgb(76,81,87) against a real value's rgb(0,0,0). That is
              close enough to read as filled, so an empty required field showed
              "platform-openapi" *and* "Field required" at the same time, which is a
              contradiction the reader has to resolve by clicking into the field. An
              example is guidance; it belongs where the guidance is.
            */}
            <FormRow
              label="Display name"
              required
              error={fields.display_name?.[0]}
              helperText="How this source is identified in the runs list. For example, platform-openapi."
            >
              <Input
                bordered
                value={draft.display_name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, display_name: event.target.value }))
                }
              />
            </FormRow>

            <FormRow
              label="Connector"
              required
              error={fields.source_type?.[0]}
              helperText="Determines how the source is discovered and parsed."
            >
              <Dropdown
                bordered
                value={draft.source_type ? termText(draft.source_type) : ''}
                onSelectionChange={(_event, selected) =>
                  setDraft((d) => ({ ...d, source_type: (selected?.[0] ?? '') as SyncSourceType }))
                }
                OverlayProps={popoverOverlayProps}
              >
                {SYNC_SOURCE_TYPES.map((type) => (
                  <Option key={type} value={type}>
                    {termText(type)}
                  </Option>
                ))}
              </Dropdown>
            </FormRow>

            <FormRow
              label="Schedule"
              error={fields.schedule?.[0]}
              helperText="A cron expression, such as 0 3 * * *. Leave empty for a source you only ever run by hand."
            >
              <Input
                bordered
                value={draft.schedule}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, schedule: event.target.value }))
                }
              />
            </FormRow>

            <FormRow
              label="Credentials reference"
              error={fields.credentials_ref?.[0]}
              helperText="A name the deployment resolves to a secret, such as vault://sync/openapi. Never the secret itself."
            >
              <Input
                bordered
                value={draft.credentials_ref}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, credentials_ref: event.target.value }))
                }
              />
            </FormRow>
          </StackLayout>
        </SectionCard>
      ) : null}

      {sources.error ? (
        <ErrorPanel error={sources.error} title="Could not list sync connectors" />
      ) : null}

      <SectionCard title="Configured sources" banded flush>
        <DataTable
          caption="Sync connectors configured for this tenant"
          hideCaption
          zebra
          columns={columns}
          rows={sources.data ?? []}
          getRowId={(row) => row.source_id}
          isLoading={sources.isPending}
          hasError={Boolean(sources.error)}
          emptyTitle="No sync connectors"
          emptyDescription="Nothing is being mirrored into this tenant yet. Add a source to start."
          emptyHeadingLevel="h3"
        />
      </SectionCard>

      <ConfirmDialog
        open={deactivating !== null}
        title={`Deactivate ${deactivating?.display_name ?? ''}?`}
        confirmLabel="Deactivate Connector"
        busy={patch.isPending}
        error={patch.error}
        onCancel={() => {
          setDeactivating(null);
          patch.reset();
        }}
        onConfirm={() => {
          if (!deactivating) return;
          patch.mutate(
            { sourceId: deactivating.source_id, patch: { is_active: false } },
            {
              // The dialog closes here and nowhere else. On failure it stays open
              // holding the error, because that is where the reader is looking.
              onSuccess: () => {
                setTriggered(`Deactivated ${deactivating.display_name}.`);
                setDeactivating(null);
              },
            },
          );
        }}
      >
        <StackLayout gap={1}>
          <Text>
            Scheduled runs stop immediately. Facts this connector has already written stay in the
            catalog — nothing is deleted.
          </Text>
          <Text color="secondary" styleAs="notation">
            Reversible: the source can be reactivated from this table.
          </Text>
        </StackLayout>
      </ConfirmDialog>
    </StackLayout>
  );
}
