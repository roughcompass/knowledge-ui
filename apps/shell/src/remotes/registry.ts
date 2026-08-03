import type { Capability } from '@knowledge-ui/auth';
import type { RemoteName } from '@knowledge-ui/remote-contract';

/**
 * What the shell knows about each remote, before loading any of it.
 *
 * The nav label and the permission live here rather than inside the remote for
 * a practical reason: putting them in the remote would mean downloading a
 * bundle just to discover whether the current user is allowed to see the nav
 * item pointing at it. The host decides what to offer; the remote decides what
 * to render once offered.
 */
/**
 * A page within a section, for the sidebar's drilled panel.
 *
 * Declared in the host for the same reason the section itself is: the sidebar has
 * to draw the child list *before* the remote is loaded, and asking the remote
 * would mean fetching its bundle to find out what to draw.
 *
 * `path` is relative to the section's `mountPath`; an empty string is the
 * section's index route. Keeping it relative means the remote can be remounted
 * elsewhere without editing these.
 */
export interface RemoteChild {
  path: string;
  label: string;
  /**
   * Capability required to see this entry. Omitted means the section's own.
   *
   * Typed as `Capability`, not `string`. It was `string`, which meant a typo in a
   * capability name was not a compile error — it silently produced an entry that
   * `can()` could never satisfy, so the nav item simply never appeared.
   */
  need?: Capability;
}

export interface RemoteDescriptor {
  name: RemoteName;
  /** Absolute path the remote is mounted at. Internal routes are relative to it. */
  mountPath: string;
  label: string;
  /** Capability required to see the nav entry and enter the route. See `RemoteChild.need`. */
  need: Capability;
  description: string;
  /**
   * Pages inside the section. A section with children gets a chevron in the
   * sidebar and drills down to its own panel; a section without one navigates
   * straight to its route.
   */
  children?: readonly RemoteChild[];
}

export const REMOTES: readonly RemoteDescriptor[] = [
  {
    name: 'catalog',
    mountPath: '/catalog',
    label: 'Capabilities',
    need: 'catalog:browse',
    description: 'Browse and search the capability catalog.',
  },
  {
    name: 'operations',
    mountPath: '/ops',
    label: 'Operations',
    need: 'ops:view',
    description: 'Service health, metrics, sync connectors, and the audit log.',
    children: [
      { path: '', label: 'Health' },
      { path: 'metrics', label: 'Metrics' },
      // The audit log needs more than the section does: the registry resolves a
      // session to one role and guards that endpoint on `auditor` specifically,
      // so an administrator who can see Operations still cannot see this page.
      { path: 'audit', label: 'Audit log', need: 'audit:read' },
      // Same pattern, other direction: every `/v1/admin/*` endpoint behind these
      // two is admin-only, while the section itself is open to every role.
      { path: 'sync', label: 'Sync connectors', need: 'admin:manage' },
      { path: 'sync/runs', label: 'Sync runs', need: 'admin:manage' },
    ],
  },
] as const;

export function remoteFor(name: RemoteName): RemoteDescriptor {
  const found = REMOTES.find((r) => r.name === name);
  if (!found) throw new Error(`no descriptor registered for remote "${name}"`);
  return found;
}
