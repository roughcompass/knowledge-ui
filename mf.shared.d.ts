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
export declare const PINNED: {
  readonly react: '18.3.1';
  readonly 'react-dom': '18.3.1';
  readonly 'react-router': '6.30.1';
  readonly 'react-router-dom': '6.30.1';
  readonly '@tanstack/react-query': '5.90.2';
  readonly '@salt-ds/core': '1.67.0';
  readonly '@salt-ds/icons': '1.18.0';
};
export declare const shared: {
  readonly react: {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '18.3.1';
  };
  readonly 'react/jsx-runtime': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '18.3.1';
  };
  readonly 'react-dom': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '18.3.1';
  };
  readonly 'react-dom/client': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '18.3.1';
  };
  readonly 'react-router': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '6.30.1';
  };
  readonly 'react-router-dom': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '6.30.1';
  };
  readonly '@tanstack/react-query': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '5.90.2';
  };
  readonly '@salt-ds/core': {
    readonly singleton: true;
    readonly strictVersion: true;
    readonly requiredVersion: '1.67.0';
  };
  readonly '@salt-ds/icons': {
    readonly singleton: true;
    readonly strictVersion: false;
    readonly requiredVersion: '1.18.0';
  };
  readonly '@salt-ds/styles': {
    readonly singleton: true;
    readonly requiredVersion: false;
  };
  readonly '@salt-ds/window': {
    readonly singleton: true;
    readonly requiredVersion: false;
  };
};
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
//# sourceMappingURL=mf.shared.d.ts.map
