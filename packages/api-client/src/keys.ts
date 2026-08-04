/**
 * React Query key factory.
 *
 * Every key begins `['kui', personaKey, tenantSlug, ...]`. That prefix is not
 * decoration: a persona switch clears the cache, but namespacing by principal
 * means even a missed clear cannot show one identity's rows to another. Getting
 * that wrong leaks data across a permission boundary, which is the one class of
 * caching bug worth designing against rather than testing for.
 */

export interface KeyScope {
  personaKey: string;
  tenantSlug: string;
}

const root = ({ personaKey, tenantSlug }: KeyScope) => ['kui', personaKey, tenantSlug] as const;

export const queryKeys = {
  scope: root,

  whoami: (scope: KeyScope) => [...root(scope), 'whoami'] as const,

  capabilities: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'capabilities', 'list', params] as const,

  /**
   * Detail keys are shared by the detail page, the row-hover prefetch and the
   * opt-in lifecycle enrichment on the list. Deliberately: enrichment then warms
   * the cache for the click that usually follows it.
   */
  capability: (scope: KeyScope, handle: string, params: Record<string, unknown> = {}) =>
    [...root(scope), 'capabilities', 'detail', handle, params] as const,

  search: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'search', params] as const,

  audit: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'audit', params] as const,

  /**
   * ADMIN — everything under `/v1/admin/*`, behind a shared `'admin'` segment.
   *
   * The segment is the point. It makes `[...root(scope), 'admin']` a prefix that
   * invalidates every operator read at once and *cannot* reach catalog, search or
   * ops — so a write handler that is unsure what it affected has a blunt option
   * that is still bounded. Per-resource prefixes below it stay available for the
   * precise case.
   *
   * `audit` above is the one exception and stays where it is: it predates this and
   * moving it would break the key for no gain. The asymmetry is deliberate rather
   * than an oversight.
   *
   * None of these takes a cursor. The admin list endpoints return bare JSON arrays
   * with no `next_cursor` and no `page_size` — verified against the spec and
   * `admin_sync.py`, which has no LIMIT — so there is no `PAGE_LIMITS` entry and no
   * `CursorStack` in the pages that read them.
   */
  adminRoot: (scope: KeyScope) => [...root(scope), 'admin'] as const,

  syncSources: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'admin', 'sync-sources', 'list', params] as const,

  syncSource: (scope: KeyScope, sourceId: string) =>
    [...root(scope), 'admin', 'sync-sources', 'detail', sourceId] as const,

  syncRuns: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'admin', 'sync-runs', 'list', params] as const,

  syncRun: (scope: KeyScope, runId: string) =>
    [...root(scope), 'admin', 'sync-runs', 'detail', runId] as const,

  supersededFacts: (scope: KeyScope, runId: string) =>
    [...root(scope), 'admin', 'sync-runs', 'detail', runId, 'superseded'] as const,

  /**
   * The operational probes are unauthenticated, so their responses do not vary
   * by principal — but they stay inside the scope anyway. A key that escaped it
   * would survive `queryClient.clear()` on a persona switch and show a reading
   * from before the switch, which reads as a stale UI for no benefit.
   */
  /**
   * Adoption is keyed per capability because the endpoint is: it returns the
   * caller's own adoption for one capability, so there is no list to key.
   */
  adoption: (scope: KeyScope, handle: string) =>
    [...root(scope), 'consumer', 'adoption', handle] as const,

  subscriptions: (scope: KeyScope, handle: string) =>
    [...root(scope), 'consumer', 'subscriptions', handle] as const,

  /**
   * The root exists so mark-read can invalidate every status filter at once.
   * Invalidating only the active filter would leave the `all` view still showing
   * an item as unread after the user marked it read in the default view.
   */
  notificationsRoot: (scope: KeyScope) => [...root(scope), 'consumer', 'notifications'] as const,

  notifications: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'consumer', 'notifications', params] as const,

  liveness: (scope: KeyScope) => [...root(scope), 'ops', 'healthz'] as const,
  readiness: (scope: KeyScope) => [...root(scope), 'ops', 'readyz'] as const,
  operationalHealth: (scope: KeyScope) => [...root(scope), 'ops', 'operational-health'] as const,

  /**
   * MEMORY — claims and the session events behind them.
   *
   * Scoped like everything else, and the scoping matters more here than
   * elsewhere: a claim's visibility is decided per entity, so two principals
   * asking the same question legitimately get different answers. A key that
   * escaped the principal prefix would serve one tenant's claims to another,
   * which for this surface is the whole trust boundary rather than a stale row.
   */
  claims: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'memory', 'claims', 'list', params] as const,

  claimSearch: (scope: KeyScope, params: Record<string, unknown> = {}) =>
    [...root(scope), 'memory', 'claims', 'search', params] as const,

  claim: (scope: KeyScope, claimId: string) =>
    [...root(scope), 'memory', 'claims', 'detail', claimId] as const,

  /**
   * IMPACT — traversals rooted at one capability.
   *
   * Keyed by the traversal's own parameters, not just the root, because depth,
   * direction, edge types and the as-of instant each change the answer. Sharing a
   * key across depths would show a depth-1 result under a depth-3 heading, which
   * is the kind of wrong that looks right.
   */
  dependencies: (scope: KeyScope, handle: string, params: Record<string, unknown> = {}) =>
    [...root(scope), 'impact', 'dependencies', handle, params] as const,

  dependents: (scope: KeyScope, handle: string, params: Record<string, unknown> = {}) =>
    [...root(scope), 'impact', 'dependents', handle, params] as const,

  blastRadius: (scope: KeyScope, handle: string, params: Record<string, unknown> = {}) =>
    [...root(scope), 'impact', 'blast-radius', handle, params] as const,
} as const;
