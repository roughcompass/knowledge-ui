import { createContext, useContext, type ReactNode } from 'react';

import type { Persona } from './personas';
import type { Session } from './types';

/**
 * What a mounted surface knows about who is looking at it.
 *
 * Each federated remote re-provides this with **its own copy** of the context
 * object, because this package is not itself federated. Two context objects
 * therefore exist on the page and each subtree reads its own — which is fine,
 * and is exactly why the values below arrive as props from the host rather than
 * being constructed independently. If a remote built its own client it would
 * hold a different token and a different cache.
 */
export interface SessionContextValue<TClient = unknown> {
  session: Session;
  client: TClient;
  /** Where this surface is mounted, for links that leave it. */
  mountPath: string;
  /** Host-owned navigation, for links into a different remote. */
  navigateAbsolute: (to: string) => void;

  /**
   * The identities available to switch to. Empty in a production build.
   *
   * Here so a surface can gate itself on a capability *and* offer the way out,
   * without every page threading the roster down by hand.
   */
  personas: readonly Persona[];

  /** Undefined when switching is unavailable. */
  onSwitchPersona?: ((personaKey: string) => void) | undefined;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider<TClient>({
  value,
  children,
}: {
  value: SessionContextValue<TClient>;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value as SessionContextValue}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession<TClient = unknown>(): SessionContextValue<TClient> {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error(
      'useSession() was called outside a SessionProvider. A federated remote receives ' +
        'session and client as props and must provide them before rendering anything that ' +
        'reads them.',
    );
  }
  return value as SessionContextValue<TClient>;
}
