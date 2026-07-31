/**
 * The Module Federation share contract. Every federated build imports this and
 * nothing declares a share anywhere else.
 *
 * Each module listed here must exist exactly once in the browser at runtime:
 *
 * - Two copies of `react-dom` means two reconcilers and hook errors that point
 *   at innocent components.
 * - Two copies of `@salt-ds/core` means the theme, density and breakpoint
 *   contexts created by the host are invisible to anything rendered inside a
 *   remote, so the remote renders unthemed at default density — and, because
 *   Salt injects component CSS at runtime, it also means two `<style>` blocks
 *   whose cascade order depends on load order.
 * - Two copies of `react-router` means `useParams()` inside a remote returns
 *   `{}`, because the context object the remote reads is not the one the host
 *   populated.
 *
 * Versions are exact strings, not ranges. Module Federation negotiates the
 * shared scope by semver: with a range, a host on 18.3.1 and a remote on 18.3.2
 * both "satisfy" the requirement and the loader is free to keep both.
 * `strictVersion` turns a silent duplication into a startup failure, which is
 * the trade we want — the failure mode it replaces is genuinely hard to debug.
 */

/** Versions every workspace must pin identically. Enforced by scripts/check-shared-parity.mjs. */
export const PINNED = {
  react: '18.3.1',
  'react-dom': '18.3.1',
  'react-router': '6.30.1',
  'react-router-dom': '6.30.1',
  '@tanstack/react-query': '5.90.2',
  '@salt-ds/core': '1.67.0',
  '@salt-ds/icons': '1.18.0',
} as const;

export const shared = {
  react: { singleton: true, strictVersion: true, requiredVersion: PINNED.react },
  // The automatic JSX runtime is a separate specifier and needs its own entry,
  // or every remote bundles a second copy of it.
  'react/jsx-runtime': { singleton: true, strictVersion: true, requiredVersion: PINNED.react },
  'react-dom': { singleton: true, strictVersion: true, requiredVersion: PINNED['react-dom'] },
  'react-dom/client': {
    singleton: true,
    strictVersion: true,
    requiredVersion: PINNED['react-dom'],
  },

  // Both packages, deliberately. react-router-dom re-exports from react-router,
  // and the router context objects live in the latter.
  'react-router': { singleton: true, strictVersion: true, requiredVersion: PINNED['react-router'] },
  'react-router-dom': {
    singleton: true,
    strictVersion: true,
    requiredVersion: PINNED['react-router-dom'],
  },

  '@tanstack/react-query': {
    singleton: true,
    strictVersion: true,
    requiredVersion: PINNED['@tanstack/react-query'],
  },

  // Holds ThemeContext / DensityContext / BreakpointContext.
  '@salt-ds/core': {
    singleton: true,
    strictVersion: true,
    requiredVersion: PINNED['@salt-ds/core'],
  },
  // Icons carry no context, so a version skew is cosmetic rather than fatal —
  // shared to avoid shipping the set twice, but not strict.
  '@salt-ds/icons': {
    singleton: true,
    strictVersion: false,
    requiredVersion: PINNED['@salt-ds/icons'],
  },

  // Salt's runtime style-injection plumbing. These coordinate which document
  // receives the injected <style> elements; two copies means duplicate rules.
  // Transitive dependencies of @salt-ds/core, so the version floats with it.
  '@salt-ds/styles': { singleton: true, requiredVersion: false },
  '@salt-ds/window': { singleton: true, requiredVersion: false },
} as const;

/**
 * Deliberately NOT shared: the `@knowledge-ui/*` workspace packages.
 *
 * They are consumed as TypeScript source rather than built artefacts, and
 * sharing raw source through this plugin is the most fragile thing it does.
 * Instead the instances that genuinely must be single — the API client and the
 * session — travel from host to remote as props on `RemoteMountProps`. Each
 * bundle carries its own copy of the surrounding (small, stateless) code and
 * re-provides those instances through its own context. Two context objects
 * exist in the page; each subtree reads its own; both hold the same value.
 */
