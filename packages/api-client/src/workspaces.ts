/**
 * Workspaces: the notebook a person or a team keeps beside the catalog.
 *
 * A workspace holds entries — notes, decisions, open questions, saved queries and
 * saved views — each one a Markdown body that may cite catalog entities by id. It
 * is the contextplane's own memory of *why* things were done, and it is deliberately
 * not part of the catalog: nothing here is a fact the catalog serves.
 *
 * ## Ownership is the sharing model, and it is fixed at creation
 *
 * `owner_kind` is `'actor'` (personal, visible only to its owner and to auditors)
 * or `'tenant'` (team, visible to every role holder in the tenant). It is chosen
 * when the workspace is created and **the API has no way to change it**: the PATCH
 * body accepts `name`, `description` and `archived_at`, and nothing else. So the
 * client offers no such call, and the detail screen says so rather than shipping a
 * control that would have to fail.
 *
 * ## Response shapes are declared here, not generated
 *
 * The OpenAPI document types every one of these responses as a bare object with
 * `additionalProperties: true`, so the generated client gives back
 * `Record<string, unknown>` and would push a cast into every call site. The
 * interfaces below mirror `WorkspaceResponse` and `EntryResponse` in
 * `contextplane/api/routers/workspaces.py` field for field, including the two the
 * router documents as absent-when-null (`warnings`, and every encryption field,
 * which is not surfaced until content encryption ships).
 *
 * ## Both writes invalidate the root
 *
 * Archiving and deleting change which rows the list returns under *both* values of
 * `include_archived`, and an entry write changes a list keyed by `kind`. Patching
 * the cached row instead would leave every other view of the same data stale, so
 * every mutation invalidates the workspace root key.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import { queryKeys, type KeyScope } from './keys';
import { compact } from './params';

/**
 * The closed ownership vocabulary, mirroring `VALID_OWNER_KINDS` in
 * `contextplane/service/workspace/_shared.py`.
 */
export const WORKSPACE_OWNER_KINDS = ['actor', 'tenant'] as const;
export type WorkspaceOwnerKind = (typeof WORKSPACE_OWNER_KINDS)[number];

/**
 * The closed entry vocabulary, mirroring `VALID_ENTRY_KINDS` in the same module.
 *
 * Enumerated rather than free text because the server rejects anything else with a
 * 422, and a dropdown of five is cheaper than teaching a reader the vocabulary
 * through failed submissions.
 */
export const WORKSPACE_ENTRY_KINDS = [
  'note',
  'decision',
  'open_question',
  'saved_query',
  'saved_view',
] as const;
export type WorkspaceEntryKind = (typeof WORKSPACE_ENTRY_KINDS)[number];

/** Mirrors `WorkspaceResponse` in `contextplane/api/routers/workspaces.py`. */
export interface Workspace {
  workspace_id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  owner_kind: WorkspaceOwnerKind;
  owner_actor_id?: string | null;
  /** Non-null means archived: the workspace is read-only until it is un-archived. */
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  t_invalidated_at?: string | null;
}

/** A PII warning the scanner raised on an entry field with policy=warn. */
export interface WorkspaceEntryWarning {
  field: string;
  categories: string[];
}

/** Mirrors `EntryResponse`. `warnings` is absent, not null, when the scanner was quiet. */
export interface WorkspaceEntry {
  entry_id: string;
  workspace_id: string;
  tenant_id: string;
  kind: string;
  body_md: string;
  references_jsonb?: Record<string, unknown> | null;
  reference_ids: string[];
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  warnings?: WorkspaceEntryWarning[];
}

export interface WorkspaceListResponse {
  items: Workspace[];
  next_cursor: string | null;
}

export interface WorkspaceEntryListResponse {
  items: WorkspaceEntry[];
  next_cursor: string | null;
  /** Search only, and advisory: the service omits it when counting would cost too much. */
  total_count?: number | null;
}

export interface WorkspaceListParams {
  /** Archived workspaces are excluded by default, matching the endpoint's own default. */
  includeArchived?: boolean;
  cursor?: string | null;
}

export function useWorkspaces(
  client: RegistryClient,
  scope: KeyScope,
  params: WorkspaceListParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<WorkspaceListResponse, RegistryError> {
  const query = compact({
    include_archived: params.includeArchived ? 'true' : undefined,
    cursor: params.cursor,
  });

  return useQuery({
    queryKey: queryKeys.workspaces(scope, query),
    enabled: options.enabled ?? true,
    queryFn: () => client.request<WorkspaceListResponse>('/v1/workspaces', { query }),
  });
}

export function useWorkspace(
  client: RegistryClient,
  scope: KeyScope,
  workspaceId: string | undefined,
): UseQueryResult<Workspace, RegistryError> {
  return useQuery({
    queryKey: queryKeys.workspace(scope, workspaceId ?? ''),
    enabled: Boolean(workspaceId),
    queryFn: () =>
      client.request<Workspace>(`/v1/workspaces/${encodeURIComponent(workspaceId as string)}`),
  });
}

export interface WorkspaceEntryParams {
  kind?: string;
  cursor?: string | null;
}

export function useWorkspaceEntries(
  client: RegistryClient,
  scope: KeyScope,
  workspaceId: string | undefined,
  params: WorkspaceEntryParams = {},
): UseQueryResult<WorkspaceEntryListResponse, RegistryError> {
  const query = compact({ kind: params.kind, cursor: params.cursor });

  return useQuery({
    queryKey: queryKeys.workspaceEntries(scope, workspaceId ?? '', query),
    enabled: Boolean(workspaceId),
    queryFn: () =>
      client.request<WorkspaceEntryListResponse>(
        `/v1/workspaces/${encodeURIComponent(workspaceId as string)}/entries`,
        { query },
      ),
  });
}

export interface WorkspaceCreate {
  name: string;
  owner_kind: WorkspaceOwnerKind;
  description?: string | null;
}

export function useCreateWorkspace(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Workspace, RegistryError, WorkspaceCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body) =>
      client.request<Workspace>('/v1/workspaces', {
        method: 'POST',
        body: compact(body as unknown as Record<string, unknown>),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}

/**
 * The only three fields the workspace PATCH accepts.
 *
 * `archived_at` is a tri-state and the distinction is load-bearing: absent leaves
 * the archive state alone, a timestamp archives, and an explicit `null`
 * un-archives. That is why the patch is sent as given rather than through
 * `compact`, which would strip the `null` and turn "un-archive" into "change
 * nothing" — a control that reports success and does nothing.
 */
export interface WorkspacePatch {
  name?: string;
  description?: string | null;
  archived_at?: string | null;
}

export function useUpdateWorkspace(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<Workspace, RegistryError, { workspaceId: string; patch: WorkspacePatch }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, patch }) =>
      client.request<Workspace>(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}

/**
 * Soft-delete, and idempotent server-side.
 *
 * The row is marked invalid rather than removed, so a second call on a workspace
 * that is already gone answers 204 as well — which is why the UI can retry a
 * delete it is unsure about without a compensating read.
 */
export function useDeleteWorkspace(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { workspaceId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId }) => {
      await client.request<void>(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}

export interface WorkspaceEntryCreate {
  workspaceId: string;
  kind: WorkspaceEntryKind;
  body_md: string;
  reference_ids?: string[];
  expires_at?: string | null;
}

export function useCreateWorkspaceEntry(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<WorkspaceEntry, RegistryError, WorkspaceEntryCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, ...body }) =>
      client.request<WorkspaceEntry>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/entries`, {
        method: 'POST',
        body: compact(body as unknown as Record<string, unknown>),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}

/**
 * Edit an entry in place.
 *
 * The endpoint has existed the whole time with no client, so an entry could be
 * created and deleted and never corrected — a typo in a decision record meant
 * deleting it and writing it again, which loses the entry's own identity and its
 * place in the feed. Workspaces are the one surface in this console a reader owns
 * outright; being unable to edit their own note is the sharpest version of the
 * read-mostly problem.
 */
export function useUpdateWorkspaceEntry(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<
  WorkspaceEntry,
  RegistryError,
  { workspaceId: string; entryId: string; body_md: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, entryId, body_md }) =>
      client.request<WorkspaceEntry>(
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries/${encodeURIComponent(entryId)}`,
        { method: 'PATCH', body: { body_md } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}

export function useDeleteWorkspaceEntry(
  client: RegistryClient,
  scope: KeyScope,
): UseMutationResult<void, RegistryError, { workspaceId: string; entryId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, entryId }) => {
      await client.request<void>(
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries/${encodeURIComponent(entryId)}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspacesRoot(scope) });
    },
  });
}
