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
export interface RemoteDescriptor {
  name: RemoteName;
  /** Absolute path the remote is mounted at. Internal routes are relative to it. */
  mountPath: string;
  label: string;
  /** Capability required to see the nav entry and enter the route. */
  need: string;
  description: string;
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
    description: 'Service health, metrics, and the audit log.',
  },
] as const;

export function remoteFor(name: RemoteName): RemoteDescriptor {
  const found = REMOTES.find((r) => r.name === name);
  if (!found) throw new Error(`no descriptor registered for remote "${name}"`);
  return found;
}
