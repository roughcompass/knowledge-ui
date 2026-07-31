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
 * identity comparisons across the boundary would fail.
 */
import type { ComponentType } from 'react';

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
}

/** The shape every `./App` expose must satisfy. Asserted by a type-level test. */
export type RemoteApp<TSession = unknown, TClient = unknown> = ComponentType<
  RemoteMountProps<TSession, TClient>
>;
