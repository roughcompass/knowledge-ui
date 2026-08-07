import type { Capability } from '@knowledge-ui/auth';
import type { RemoteName } from '@knowledge-ui/remote-contract';

/** What the shell needs to mount a remote before downloading its bundle. */
export interface RemoteDescriptor {
  name: RemoteName;
  /** Absolute path the remote is mounted at. Internal routes are relative to it. */
  mountPath: string;
  label: string;
  /** Capability required to enter the remote route. */
  need: Capability;
  description: string;
}

export const REMOTES: readonly RemoteDescriptor[] = [
  {
    name: 'catalog',
    mountPath: '/catalog',
    label: 'Catalog',
    need: 'catalog:browse',
    description: 'Browse and search the capability catalog.',
  },
  {
    name: 'operations',
    mountPath: '/ops',
    label: 'Operations',
    need: 'ops:view',
    description: 'Service health, metrics, sync connectors, and the audit log.',
  },
] as const;

export function remoteFor(name: RemoteName): RemoteDescriptor {
  const found = REMOTES.find((remote) => remote.name === name);
  if (!found) throw new Error(`no descriptor registered for remote "${name}"`);
  return found;
}

/** A page within a top-level navigation section. */
export interface NavigationChild {
  /** Absolute route owned by this navigation entry. */
  href: string;
  label: string;
  /**
   * Capability required to see this entry. Omitted means the section's own.
   *
   * Typed as `Capability`, not `string`, so a typo cannot silently hide an
   * otherwise valid destination.
   */
  need?: Capability;
}

export type NavigationKey = RemoteName | 'context' | 'graph';

/**
 * One user-facing area in the shell rail.
 *
 * Navigation is separate from remote mounts because a product area can point to
 * a page inside a broader bundle. The Graph is the worked example: its four
 * pages remain served by the catalog remote at their stable routes, but appear
 * under a menu of their own rather than the Catalog menu.
 */
export interface NavigationSection {
  key: NavigationKey;
  href: string;
  label: string;
  need: Capability;
  description: string;
  children: readonly NavigationChild[];
}

function navigationForRemote(
  name: RemoteName,
  children: readonly NavigationChild[],
): NavigationSection {
  const remote = remoteFor(name);
  return {
    key: remote.name,
    href: remote.mountPath,
    label: remote.label,
    need: remote.need,
    description: remote.description,
    children,
  };
}

/**
 * A path inside a remote, composed from that remote's mount point.
 *
 * Exported so pages link the same way the rail does. Writing the mount point out
 * by hand puts a second copy of it in a file that never sees the descriptor, and
 * a remount then leaves working navigation beside a dead link.
 */
export function remoteChildHref(name: RemoteName, path: string): string {
  return `${remoteFor(name).mountPath}/${path}`;
}

export const NAVIGATION: readonly NavigationSection[] = [
  navigationForRemote('catalog', [
    { href: '/catalog', label: 'Capabilities' },
    /*
     * Claims and Workspaces used to be top-level sections of their own, the
     * first labelled "Memory".
     *
     * Both were sections with exactly one child, and the child of "Memory" was
     * called "Claims" — so the rail asked a reader to learn that this product's
     * word for a page of claims is Memory, and then made them open a menu to
     * find the page they had already been told about. "Memory" is our word for
     * the store, not theirs: an application engineer looking for what the system
     * believes about a library does not go looking under Memory.
     *
     * They belong here because they are the same artifact from another angle.
     * Claims are statements about the entities on the Capabilities page, and a
     * workspace is a set of notes kept beside them. Neither is a separate
     * activity, and six top-level destinations for four jobs is taxonomy the
     * reader pays for.
     *
     * Each keeps its own `need`, because a section's capability is the weakest
     * of its children's and folding these in would otherwise have shown a
     * consumer two links to a refusal.
     */
    { href: remoteChildHref('catalog', 'claims'), label: 'Claims', need: 'memory:read' },
    {
      href: remoteChildHref('catalog', 'workspaces'),
      label: 'Workspaces',
      need: 'workspace:read',
    },
    // This tenant-scoped endpoint needs no capability beyond the section's own.
    {
      href: remoteChildHref('catalog', 'notifications'),
      label: 'Notifications',
    },
    {
      // Beside Claims rather than under Operations: the steward reading it is the
      // same reader who browses claims, and the endpoint takes the same capability.
      href: remoteChildHref('catalog', 'claims/queue'),
      label: 'Curation Queue',
      need: 'memory:read',
    },
  ]),
  {
    /*
     * Context evaluation is a distinct job, not another view of one catalog
     * entity. It remains served by the catalog remote, but has its own section
     * so the lab is reachable directly from the dashboard and top-level rail.
     *
     * Retrieval probes use Catalog, Claims and Workspace reads, all of which
     * admit every current tenant role. The page still checks each source before
     * offering it; the section gate is the weakest honest common gate.
     */
    key: 'context',
    href: remoteChildHref('catalog', 'context'),
    label: 'Context Lab',
    need: 'catalog:browse',
    description: 'Test retrieval evidence and inspect governed context receipts.',
    children: [
      { href: remoteChildHref('catalog', 'context'), label: 'Probes' },
      { href: remoteChildHref('catalog', 'context/receipts'), label: 'Receipt Inspector' },
    ],
  },
  {
    // Served by the catalog bundle, like Claims and Workspaces, and for the same
    // reason: a product area is not obliged to be a deployment unit. It stays a
    // section of its own rather than folding in with them because it has four
    // pages and asks a different question — how the catalog is connected, not
    // what is in it.
    //
    // The section's own capability is the projection read, which every role
    // holds — both `/v1/graph/*` routes take a tenant context and no role check.
    // The ontology child is admin-only because its three endpoints live under
    // `/v1/admin/*`, so it declares that separately rather than raising the bar
    // for the section and hiding the projections from three roles that may read
    // them.
    key: 'graph',
    href: remoteChildHref('catalog', 'graph'),
    label: 'Graph',
    need: 'graph:read',
    description: 'How the catalog is connected, and the ontology that shapes it.',
    children: [
      { href: remoteChildHref('catalog', 'graph'), label: 'Overview' },
      { href: remoteChildHref('catalog', 'graph/projections'), label: 'Projections' },
      // No `need` of its own: the reach half is readable by every role that
      // holds `impact:read`, and the usage halves gate themselves inside the
      // page. Gating the link on the usage scope would hide breadth and depth
      // from the roles allowed to see them.
      { href: remoteChildHref('catalog', 'graph/analytics'), label: 'Analytics' },
      {
        href: remoteChildHref('catalog', 'graph/ontology'),
        label: 'Ontology',
        need: 'ontology:read',
      },
    ],
  },
  navigationForRemote('operations', [
    { href: '/ops', label: 'Health' },
    // Usage needs a scope of its own. The section is open to every role because
    // the probes behind it are unauthenticated; the aggregate reads are not, so
    // reusing the section's capability would offer three roles a refusal. The
    // owner-scoped half is what lets a producer reach the page at all.
    {
      href: remoteChildHref('operations', 'usage'),
      label: 'Usage',
      need: 'usage:read:owned',
    },
    // The audit log needs more than the section does: the registry resolves a
    // session to one role and guards that endpoint on `auditor` specifically,
    // so an administrator who can see Operations still cannot see this page.
    {
      href: remoteChildHref('operations', 'audit'),
      label: 'Audit Log',
      need: 'audit:read',
    },
    // Same pattern, other direction: every `/v1/admin/*` endpoint behind these
    // two is admin-only, while the section itself is open to every role.
    {
      href: remoteChildHref('operations', 'sync'),
      label: 'Sync Connectors',
      need: 'admin:manage',
    },
    {
      href: remoteChildHref('operations', 'sync/runs'),
      label: 'Sync Runs',
      need: 'admin:manage',
    },
  ]),
] as const;

/** Return the most specific visible section that owns the current route. */
export function navigationSectionForPath(
  pathname: string,
  sections: readonly NavigationSection[] = NAVIGATION,
): NavigationSection | undefined {
  let best: NavigationSection | undefined;
  let bestScore = -1;

  for (const section of sections) {
    for (const child of section.children) {
      const ownsPath = pathname === child.href || pathname.startsWith(`${child.href}/`);
      if (ownsPath && child.href.length > bestScore) {
        best = section;
        bestScore = child.href.length;
      }
    }
  }

  return best;
}
