/**
 * Module declarations for the federated remotes.
 *
 * Hand-written on purpose. The plugin can generate these, but generation needs
 * the remote's dev server reachable while typechecking, which would make
 * `npm run typecheck` depend on a running process and fail differently in CI
 * than on a laptop. These declarations are three lines each and change only
 * when the exposed surface changes.
 *
 * The props type comes from the shared contract package, so a drift between
 * what the host passes and what a remote expects is a compile error even
 * though the import itself resolves at runtime.
 */
declare module 'catalog/App' {
  import type { RemoteApp } from '@knowledge-ui/remote-contract';
  const App: RemoteApp;
  export default App;
}

declare module 'operations/App' {
  import type { RemoteApp } from '@knowledge-ui/remote-contract';
  const App: RemoteApp;
  export default App;
}
