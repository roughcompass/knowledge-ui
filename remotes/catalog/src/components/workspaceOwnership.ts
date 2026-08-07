import { can, type Session } from '@knowledge-ui/auth';
import type { Workspace, WorkspaceOwnerKind } from '@knowledge-ui/api-client';

/**
 * Ownership, in the reader's words rather than the wire's.
 *
 * `owner_kind` is `actor` or `tenant` on the wire, and neither word describes
 * what a reader is choosing between. They are choosing who else can see this —
 * nobody, or the team — so the labels say that, and the wire values never appear
 * on screen. `termText` is not the tool here: it would render "Actor", which is
 * the field name spelled politely, not the meaning.
 */
export const OWNERSHIP_LABEL: Record<WorkspaceOwnerKind, string> = {
  actor: 'Personal',
  tenant: 'Team',
};

/** The one-line consequence of each choice, for the form and the detail page. */
export const OWNERSHIP_MEANING: Record<WorkspaceOwnerKind, string> = {
  actor: 'Only you can see this workspace. Auditors can read it.',
  tenant: 'Everyone with a role in this tenant can see this workspace.',
};

/**
 * Whether this session may write to this workspace, decided per workspace.
 *
 * A capability alone cannot answer it, because the server's gate is not a
 * property of the caller — it is a property of the pair. A personal workspace is
 * writable by its owning producer and by nobody else, an admin included; a team
 * workspace is writable by an admin and by nobody else, its creator included.
 *
 * Owner identity is not compared here, and does not need to be: a producer only
 * ever perceives their own personal workspaces, so any actor-owned row that
 * reached this screen under a producer session is theirs. The reader who
 * perceives other people's — the auditor — holds neither write capability, so
 * this returns false for them before ownership could matter.
 */
export function canWriteWorkspace(session: Session, workspace: Workspace): boolean {
  return workspace.owner_kind === 'actor'
    ? can(session, 'workspace:write:personal')
    : can(session, 'workspace:write:team');
}

/**
 * Which kinds of workspace this session may create.
 *
 * Producers create personal ones, admins create team ones, and the two grants do
 * not overlap — so this is usually a list of one, and a session holding neither
 * gets an empty list rather than a form that cannot be submitted.
 */
export function creatableOwnerKinds(session: Session): WorkspaceOwnerKind[] {
  const kinds: WorkspaceOwnerKind[] = [];
  if (can(session, 'workspace:write:personal')) kinds.push('actor');
  if (can(session, 'workspace:write:team')) kinds.push('tenant');
  return kinds;
}
