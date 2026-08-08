import { HttpResponse, http } from 'msw';

import { makeErrorEnvelope } from '../fixtures';
import { roleFor, subjectOf } from './role';

/**
 * Workspace handlers, with a store and the server's real gates.
 *
 * Fixed responses would make this area untestable in the mocked lane, because
 * everything interesting about workspaces is conditional: who may see a row is
 * decided per row, who may write to it is decided per pair of caller and
 * workspace, and an archived workspace answers reads while refusing entries.
 * A handler that always says yes cannot show a persona switch changing anything,
 * which is the one thing a reviewer wants to try.
 *
 * The gates below mirror `contextplane/service/workspace/core.py`. Two details there
 * are easy to get wrong and are reproduced deliberately:
 *
 *  - **Metadata updates are not blocked by archiving.** The update route uses the
 *    archive gate, which is archive-state independent — otherwise an archived
 *    workspace could never be un-archived. Only entry writes are refused.
 *  - **A workspace you may not see answers 404, not 403.** The server refuses to
 *    let a caller learn that a row exists by the shape of its refusal.
 */

interface WorkspaceRow {
  workspace_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  owner_kind: 'actor' | 'tenant';
  owner_actor_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface EntryRow {
  entry_id: string;
  workspace_id: string;
  tenant_id: string;
  kind: string;
  body_md: string;
  references_jsonb: Record<string, unknown> | null;
  reference_ids: string[];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  warnings?: Array<{ field: string; categories: string[] }>;
}

/** The producer persona owns the seeded personal workspace. */
const PRODUCER_SUB = 'knowledge-ui-producer';

let workspaces: WorkspaceRow[] = [];
let entries: EntryRow[] = [];
let seq = 0;

export function resetWorkspaceStore(): void {
  seq = 0;
  workspaces = [
    {
      workspace_id: 'ws-team',
      tenant_id: 't-1',
      name: 'Digital Enablement decisions',
      description: 'Why the platform group chose what it chose.',
      owner_kind: 'tenant',
      owner_actor_id: null,
      archived_at: null,
      created_at: '2026-07-02T09:00:00Z',
      updated_at: '2026-08-04T16:20:00Z',
      created_by: 'knowledge-ui-admin',
    },
    {
      workspace_id: 'ws-personal',
      tenant_id: 't-1',
      name: 'Host-to-host migration notes',
      description: null,
      owner_kind: 'actor',
      owner_actor_id: PRODUCER_SUB,
      archived_at: null,
      created_at: '2026-07-20T11:30:00Z',
      updated_at: '2026-08-05T08:05:00Z',
      created_by: PRODUCER_SUB,
    },
    {
      // Archived on purpose: the state is otherwise unreachable without
      // archiving something first, and it is the state most likely to be got
      // wrong.
      workspace_id: 'ws-archived',
      tenant_id: 't-1',
      name: 'Vendor grid evaluation',
      description: 'Closed out when the contract ended.',
      owner_kind: 'tenant',
      owner_actor_id: null,
      archived_at: '2026-06-30T17:00:00Z',
      created_at: '2026-03-11T10:00:00Z',
      updated_at: '2026-06-30T17:00:00Z',
      created_by: 'knowledge-ui-admin',
    },
  ];
  entries = [
    {
      entry_id: 'we-1',
      workspace_id: 'ws-team',
      tenant_id: 't-1',
      kind: 'decision',
      body_md:
        'We standardise on the Salt design system for all internal surfaces.\n\nThe alternative was maintaining a fork, which nobody volunteered to own.',
      references_jsonb: null,
      reference_ids: ['salt-design-system'],
      expires_at: null,
      created_at: '2026-08-04T16:20:00Z',
      updated_at: '2026-08-04T16:20:00Z',
      created_by: 'knowledge-ui-admin',
    },
    {
      entry_id: 'we-2',
      workspace_id: 'ws-team',
      tenant_id: 't-1',
      kind: 'open_question',
      body_md:
        'Does the payments API keep its v2 surface once the host-to-host file gateway is retired?',
      references_jsonb: null,
      reference_ids: ['payments-api'],
      expires_at: null,
      created_at: '2026-08-05T09:10:00Z',
      updated_at: '2026-08-05T09:10:00Z',
      created_by: 'knowledge-ui-admin',
    },
    {
      entry_id: 'we-3',
      workspace_id: 'ws-personal',
      tenant_id: 't-1',
      kind: 'note',
      body_md: 'Ask the payments platform team who owns the reconciliation job.',
      references_jsonb: null,
      reference_ids: [],
      expires_at: null,
      created_at: '2026-08-05T08:05:00Z',
      updated_at: '2026-08-05T08:05:00Z',
      created_by: PRODUCER_SUB,
    },
  ];
}

resetWorkspaceStore();

/** Perceivability, mirroring the service: tenant-owned to all, actor-owned to its owner or an auditor. */
function canSee(ws: WorkspaceRow, role: string, sub: string | null): boolean {
  if (ws.owner_kind === 'tenant') return true;
  if (role === 'auditor') return true;
  return ws.owner_actor_id === sub && (role === 'producer' || role === 'consumer');
}

/** Write gate for metadata, archiving and deletion — ownership plus role, never archive state. */
function canAdminister(ws: WorkspaceRow, role: string, sub: string | null): boolean {
  return ws.owner_kind === 'actor'
    ? ws.owner_actor_id === sub && role === 'producer'
    : role === 'admin';
}

const notFound = () =>
  HttpResponse.json(makeErrorEnvelope('not_found', 'workspace not found'), { status: 404 });

const denied = (message: string) =>
  HttpResponse.json(makeErrorEnvelope('forbidden', message), { status: 403 });

function find(id: string): WorkspaceRow | undefined {
  return workspaces.find((w) => w.workspace_id === id);
}

export const workspaceHandlers = [
  http.get('*/v1/workspaces', ({ request }) => {
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('include_archived') === 'true';
    const role = roleFor(request);
    const sub = subjectOf(request);
    const items = workspaces
      .filter((w) => canSee(w, role, sub))
      .filter((w) => includeArchived || w.archived_at === null);
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.post('*/v1/workspaces', async ({ request }) => {
    const role = roleFor(request);
    const sub = subjectOf(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ownerKind = body.owner_kind === 'tenant' ? 'tenant' : 'actor';

    if (ownerKind === 'actor' && role !== 'producer') {
      return denied('Only producers may create actor-owned workspaces.');
    }
    if (ownerKind === 'tenant' && role !== 'admin') {
      return denied('Only admins may create tenant-owned workspaces.');
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name === '') {
      // FastAPI's own 422 shape, because that is what the field-error parser in
      // the api-client reads.
      return HttpResponse.json(
        { detail: [{ loc: ['body', 'name'], msg: 'Field required', type: 'missing' }] },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const row: WorkspaceRow = {
      workspace_id: `ws-${++seq}`,
      tenant_id: 't-1',
      name,
      description: typeof body.description === 'string' ? body.description : null,
      owner_kind: ownerKind,
      owner_actor_id: ownerKind === 'actor' ? sub : null,
      archived_at: null,
      created_at: now,
      updated_at: now,
      created_by: sub,
    };
    workspaces = [row, ...workspaces];
    return HttpResponse.json(row, { status: 201 });
  }),

  // Before `/:workspaceId`: "search" would otherwise be treated as an id.
  http.get('*/v1/workspaces/search', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const kind = url.searchParams.get('kind');
    const role = roleFor(request);
    const sub = subjectOf(request);
    const visibleWorkspaceIds = new Set(
      workspaces.filter((workspace) => canSee(workspace, role, sub)).map((row) => row.workspace_id),
    );
    const items = entries
      .filter((entry) => visibleWorkspaceIds.has(entry.workspace_id))
      .filter((entry) => !q || entry.body_md.toLowerCase().includes(q))
      .filter((entry) => !kind || entry.kind === kind);

    return HttpResponse.json({ items, next_cursor: null, total_count: items.length });
  }),

  http.get('*/v1/workspaces/:workspaceId', ({ params, request }) => {
    const row = find(String(params.workspaceId));
    if (!row || !canSee(row, roleFor(request), subjectOf(request))) return notFound();
    return HttpResponse.json(row);
  }),

  http.patch('*/v1/workspaces/:workspaceId', async ({ params, request }) => {
    const row = find(String(params.workspaceId));
    const role = roleFor(request);
    const sub = subjectOf(request);
    if (!row || !canSee(row, role, sub)) return notFound();
    if (!canAdminister(row, role, sub)) return denied('Not permitted to update this workspace.');

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.name === 'string') row.name = body.name;
    if ('description' in body) row.description = (body.description as string | null) ?? null;
    // Tri-state, as on the wire: absent leaves it alone, null un-archives, a
    // string archives.
    if ('archived_at' in body) row.archived_at = (body.archived_at as string | null) ?? null;
    row.updated_at = new Date().toISOString();
    return HttpResponse.json(row);
  }),

  http.delete('*/v1/workspaces/:workspaceId', ({ params, request }) => {
    const row = find(String(params.workspaceId));
    const role = roleFor(request);
    const sub = subjectOf(request);
    // Delete is idempotent: an already-gone workspace answers 204, not 404.
    if (!row) return new HttpResponse(null, { status: 204 });
    if (!canSee(row, role, sub)) return notFound();
    if (!canAdminister(row, role, sub)) return denied('Not permitted to delete this workspace.');
    workspaces = workspaces.filter((w) => w.workspace_id !== row.workspace_id);
    entries = entries.filter((e) => e.workspace_id !== row.workspace_id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/v1/workspaces/:workspaceId/entries', ({ params, request }) => {
    const row = find(String(params.workspaceId));
    if (!row || !canSee(row, roleFor(request), subjectOf(request))) return notFound();
    const kind = new URL(request.url).searchParams.get('kind');
    const items = entries
      .filter((e) => e.workspace_id === row.workspace_id)
      .filter((e) => !kind || e.kind === kind);
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.post('*/v1/workspaces/:workspaceId/entries', async ({ params, request }) => {
    const row = find(String(params.workspaceId));
    const role = roleFor(request);
    const sub = subjectOf(request);
    if (!row || !canSee(row, role, sub)) return notFound();
    if (!canAdminister(row, role, sub)) return denied('Not permitted to write entries here.');
    if (row.archived_at !== null) {
      return denied('Workspace is archived; entry writes are not permitted.');
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = typeof body.body_md === 'string' ? body.body_md : '';
    if (text.trim() === '') {
      return HttpResponse.json(
        { detail: [{ loc: ['body', 'body_md'], msg: 'Field required', type: 'missing' }] },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const entry: EntryRow = {
      entry_id: `we-${++seq}`,
      workspace_id: row.workspace_id,
      tenant_id: 't-1',
      kind: typeof body.kind === 'string' ? body.kind : 'note',
      body_md: text,
      references_jsonb: null,
      reference_ids: Array.isArray(body.reference_ids) ? (body.reference_ids as string[]) : [],
      expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
      created_at: now,
      updated_at: now,
      created_by: sub,
      // A crude stand-in for the PII scanner at policy=warn: enough to exercise
      // the warning path, which is otherwise unreachable without a real scan.
      ...(/@[\w.-]+\.\w+/.test(text)
        ? { warnings: [{ field: 'body_md', categories: ['email'] }] }
        : {}),
    };
    entries = [...entries, entry];
    row.updated_at = now;
    return HttpResponse.json(entry, { status: 201 });
  }),

  http.delete('*/v1/workspaces/:workspaceId/entries/:entryId', ({ params, request }) => {
    const row = find(String(params.workspaceId));
    const role = roleFor(request);
    const sub = subjectOf(request);
    if (!row || !canSee(row, role, sub)) return notFound();
    if (!canAdminister(row, role, sub)) return denied('Not permitted to write entries here.');
    if (row.archived_at !== null) {
      return denied('Workspace is archived; entry writes are not permitted.');
    }
    entries = entries.filter((e) => e.entry_id !== String(params.entryId));
    return new HttpResponse(null, { status: 204 });
  }),
];
