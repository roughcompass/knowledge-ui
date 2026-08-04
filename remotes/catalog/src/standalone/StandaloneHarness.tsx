import { createRegistryClient } from '@knowledge-ui/api-client';
import { DevPersonaAuthProvider, apiBaseUrl, loadPersonas, type Persona } from '@knowledge-ui/auth';
import { ErrorPanel, LoadingPanel } from '@knowledge-ui/ui-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CatalogApp from '../expose/App';

/**
 * Minimal host substitute for running this remote alone.
 *
 * It does the smallest possible version of what the shell does — mint a token,
 * build a client, resolve a session — so the remote can be developed without the
 * shell running. Deliberately not shared with the shell's implementation: this
 * exists to be thrown away if the remote ever stops being independently
 * runnable, and coupling it to the host's bootstrap would make the shell harder
 * to change.
 */
export function StandaloneHarness() {
  const navigate = useNavigate();
  const authRef = useRef<DevPersonaAuthProvider | null>(null);
  const [personas, setPersonas] = useState<readonly Persona[] | null>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof resolve>> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const client = useMemo(() => {
    if (!personas || personas.length === 0) return null;
    authRef.current ??= new DevPersonaAuthProvider({ personas, apiBaseUrl: apiBaseUrl() });
    return createRegistryClient({
      baseUrl: apiBaseUrl(),
      getToken: async () => (await authRef.current?.getToken()) ?? null,
    });
  }, [personas]);

  useEffect(() => {
    void loadPersonas().then(setPersonas).catch(setError);
  }, []);

  useEffect(() => {
    if (!client) return;
    void resolve(client).then(setSession).catch(setError);
  }, [client]);

  if (error) return <ErrorPanel error={error} title="Standalone harness could not start" />;
  if (!client || !session) return <LoadingPanel label="Starting standalone harness" />;

  // A roster but no switch handler, deliberately. Re-minting and clearing the
  // query cache is host behaviour, and a second implementation of it here would
  // be a second implementation of the thing most worth having only one of. A
  // gated route therefore explains without offering an action — which is also
  // exactly what a production build does.
  return (
    <CatalogApp
      session={session}
      client={client}
      mountPath="/"
      navigateAbsolute={(to) => navigate(to)}
      personas={personas ?? []}
    />
  );
}

async function resolve(client: ReturnType<typeof createRegistryClient>) {
  const { toSession } = await import('@knowledge-ui/auth');
  const whoami = await client.request<Parameters<typeof toSession>[0]>('/v1/whoami');
  return toSession(whoami, 'standalone');
}
