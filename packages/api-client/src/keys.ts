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
   * The operational probes are unauthenticated, so their responses do not vary
   * by principal — but they stay inside the scope anyway. A key that escaped it
   * would survive `queryClient.clear()` on a persona switch and show a reading
   * from before the switch, which reads as a stale UI for no benefit.
   */
  liveness: (scope: KeyScope) => [...root(scope), 'ops', 'healthz'] as const,
  readiness: (scope: KeyScope) => [...root(scope), 'ops', 'readyz'] as const,
  metrics: (scope: KeyScope) => [...root(scope), 'ops', 'metrics'] as const,
} as const;
