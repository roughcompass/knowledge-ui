/**
 * The typed handshake between the shell and a federated remote.
 *
 * Module Federation resolves remotes at runtime, so nothing about a remote's
 * shape is checked when the host is built. This module is how we get the check
 * back: both sides import these types from the same source, so `tsc` catches a
 * drift in the mount props even though the import itself is dynamic.
 *
 * Types only — no runtime export. That is deliberate. This package is not
 * federated, so a runtime value here would be duplicated into every bundle and
 * identity comparisons across the boundary would fail. The `@knowledge-ui/auth`
 * import below is `import type` for the same reason: it is erased at build time,
 * so depending on that package costs nothing at runtime and avoids maintaining a
 * second persona shape that could drift from the real one.
 */
import type { ComponentType } from 'react';

import type { Persona } from '@knowledge-ui/auth';

/** Names the shell knows how to mount. Adding one is a change here and in the shell's route table. */
export type RemoteName = 'catalog' | 'operations';

/**
 * Everything a remote needs from its host.
 *
 * `session` and `client` are the *host's* instances, passed down rather than
 * constructed independently. Each remote re-provides them through its own copy
 * of the surrounding context; two context objects exist on the page, each
 * subtree reads its own, and both hold the same value. That is what lets the
 * internal packages stay unshared.
 */
export interface RemoteMountProps<TSession = unknown, TClient = unknown> {
  /**
   * Server-resolved identity. The role here comes from the API, never from the
   * persona registry — a UI that decided its own permissions would offer
   * actions the server then rejects.
   */
  session: TSession;

  /** The host's API client: carries the bearer token, tenant header and retry policy. */
  client: TClient;

  /**
   * Absolute path this remote is mounted at, e.g. `/catalog`.
   *
   * Only for building links *out* of the remote. Navigation inside a remote is
   * relative and needs no knowledge of where it was mounted, which is what
   * allows the same bundle to mount at a different path without a rebuild.
   */
  mountPath: string;

  /** Host-owned navigation, for links that cross into another remote. */
  navigateAbsolute: (to: string) => void;

  /**
   * The path another remote is mounted at, optionally with a child appended.
   *
   * `navigateAbsolute` above can move the reader across the boundary but cannot
   * produce an `href`, so a cross-remote reference could only ever be a click
   * handler — which is why the entire operations remote emitted no links at all and
   * rendered raw ids where it meant "this capability". A real anchor needs a path,
   * and only the host knows where each remote is mounted.
   *
   * Resolved by the host from the same descriptor the rail reads, so a remote still
   * does not know or hard-code where any other one lives.
   */
  hrefForRemote: (remote: RemoteName, childPath?: string) => string;

  /**
   * Who the reader could become, and how to become them.
   *
   * Part of the handshake because a remote cannot work this out for itself: the
   * roster is a host concern, and a remote that guessed at it would offer to
   * switch to an identity the host does not have. It is here so a remote can
   * gate its own sub-routes and still explain the way out — the audit log is the
   * case that forces it, since the registry resolves a session to one role and
   * requires `auditor` specifically, so being refused is normal and the fix is
   * to authenticate as someone else.
   *
   * Empty in a production build, where the switcher does not exist; the gate
   * then explains without offering an action.
   */
  personas: readonly Persona[];

  /** Undefined when switching is not available, which is the production case. */
  onSwitchPersona?: ((personaKey: string) => void) | undefined;
}

/** The shape every `./App` expose must satisfy. Asserted by a type-level test. */
export type RemoteApp<TSession = unknown, TClient = unknown> = ComponentType<
  RemoteMountProps<TSession, TClient>
>;
