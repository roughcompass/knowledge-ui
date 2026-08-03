import { createRegistryClient, useReadiness, type RegistryClient } from '@knowledge-ui/api-client';
import {
  DevPersonaAuthProvider,
  RequireCapability,
  apiBaseUrl,
  loadPersonas,
  readSelectedPersona,
  writeSelectedPersona,
  type Persona,
  type Session,
} from '@knowledge-ui/auth';
import { ErrorPanel, LoadingPanel } from '@knowledge-ui/ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { AppFrame } from './chrome/AppFrame';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SessionDebugPage } from './pages/SessionDebugPage';
import { CatalogRemote, OperationsRemote } from './remotes/lazy';
import { RemoteBoundary } from './remotes/RemoteBoundary';
import { REMOTES } from './remotes/registry';
import { SessionBootstrap } from './session/SessionBootstrap';
import { AppProviders } from './app/providers';
import { resolveBasename } from './app/basename';

/**
 * The host.
 *
 * Owns exactly four things the remotes must not duplicate: the theme, the query
 * cache, the router, and the API client. Each of those has to be single — two
 * query caches means a remote's data never appears in the host's devtools, two
 * clients means two tokens, two routers means navigation that only works in one
 * half of the page.
 */

export function App() {
  return (
    <AppProvidersWithMode>
      {(mode, toggleMode) => (
        <BrowserRouter
          basename={resolveBasename()}
          // Opted in rather than left to warn on every boot. `v7_relativeSplatPath`
          // is the load-bearing one: every remote mounts under a splat route and
          // navigates with relative paths, so this flag governs where a remote's
          // own links resolve. Adopting it now means the behaviour under test is
          // the behaviour a v7 upgrade will keep, instead of a v6 default that
          // changes underneath the remotes later.
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AuthenticatedApp mode={mode} onToggleMode={toggleMode} />
        </BrowserRouter>
      )}
    </AppProvidersWithMode>
  );
}

/** Mode lives above the provider, since the provider consumes it. */
function AppProvidersWithMode({
  children,
}: {
  children: (mode: 'light' | 'dark', toggle: () => void) => React.ReactNode;
}) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const toggle = useCallback(() => setMode((m) => (m === 'light' ? 'dark' : 'light')), []);
  return <AppProviders mode={mode}>{children(mode, toggle)}</AppProviders>;
}

function AuthenticatedApp({
  mode,
  onToggleMode,
}: {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [personas, setPersonas] = useState<readonly Persona[] | null>(null);
  const [personaKey, setPersonaKey] = useState<string | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);

  /**
   * The tenant header, once a tenant has been chosen.
   *
   * Held in a ref rather than state because the client reads it on every request
   * through a closure — re-creating the client on each change would drop the
   * in-flight request that prompted the choice.
   */
  const tenantSlug = useRef<string | null>(null);

  const authRef = useRef<DevPersonaAuthProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPersonas()
      .then((roster) => {
        if (cancelled) return;
        if (roster.length === 0) {
          // Nothing to switch between. A hosted deployment would install a real
          // provider here; there is no sensible default to invent.
          setBootError(
            new Error(
              'No authentication strategy is available. The persona switcher is a development ' +
                'affordance and is disabled in this build.',
            ),
          );
          return;
        }
        // Restore the last choice so a reload does not silently drop back to the
        // first persona in the roster. An unknown key (roster edited since) falls
        // through to the default rather than failing to start.
        const remembered = readSelectedPersona(apiBaseUrl());
        authRef.current = new DevPersonaAuthProvider({
          personas: roster,
          apiBaseUrl: apiBaseUrl(),
          ...(remembered ? { initialPersonaKey: remembered } : {}),
        });
        setPersonas(roster);
        setPersonaKey(authRef.current.personaKey);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBootError(error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const client: RegistryClient | null = useMemo(() => {
    if (!authRef.current || !personaKey) return null;
    return createRegistryClient({
      baseUrl: apiBaseUrl(),
      getToken: () => authRef.current?.getToken() ?? Promise.resolve(null),
      // Sent only after an explicit choice. A tenant header that does not match a
      // single-grant principal's own tenant is refused with a 403, so guessing
      // would lock the reader out of an account that works.
      getTenantSlug: () => tenantSlug.current ?? undefined,
      onUnauthenticated: () => {
        // Reported, not acted upon. Navigating from inside the request layer is
        // what makes an app hard to test; the bootstrap decides what to do.
        authRef.current?.invalidate();
      },
    });
    // personaKey is the dependency that matters: a switch must produce a client
    // whose token closure reads the new persona.
  }, [personaKey]);

  const switchPersona = useCallback(
    async (nextKey: string) => {
      const auth = authRef.current;
      if (!auth) return;
      await auth.switchTo(nextKey);
      // A different principal's cached rows are not stale, they are not ours to
      // show. `clear` rather than `invalidateQueries` for that reason.
      queryClient.clear();
      tenantSlug.current = null;
      writeSelectedPersona(apiBaseUrl(), nextKey);
      setPersonaKey(nextKey);
      navigate('/');
    },
    [navigate, queryClient],
  );

  if (bootError) return <ErrorPanel error={bootError} title="Could not start" />;
  if (!client || !personaKey || !personas) return <LoadingPanel label="Starting" />;

  return (
    <SessionBootstrap
      client={client}
      personaKey={personaKey}
      onTenantSelected={(slug) => {
        tenantSlug.current = slug;
      }}
      onReauthenticate={async () => {
        authRef.current?.invalidate();
        return Boolean(await authRef.current?.getToken());
      }}
    >
      {(session) => (
        <ShellRoutes
          session={session}
          client={client}
          personas={personas}
          onSwitchPersona={(key) => void switchPersona(key)}
          mode={mode}
          onToggleMode={onToggleMode}
        />
      )}
    </SessionBootstrap>
  );
}

function ShellRoutes({
  session,
  client,
  personas,
  onSwitchPersona,
  mode,
  onToggleMode,
}: {
  session: Session;
  client: RegistryClient;
  personas: readonly Persona[];
  onSwitchPersona: (key: string) => void;
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}) {
  const navigate = useNavigate();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const readiness = useReadiness(scope, apiBaseUrl());

  const mountProps = (mountPath: string) => ({
    session,
    client,
    mountPath,
    navigateAbsolute: (to: string) => navigate(to),
    // The host gates a remote's *mount*; only the remote knows which of its own
    // child routes need more. Handing over the roster is what lets it gate those
    // and still offer the switch, instead of rendering an unexplained empty page.
    personas,
    onSwitchPersona,
  });

  const catalog = REMOTES.find((r) => r.name === 'catalog');
  const operations = REMOTES.find((r) => r.name === 'operations');

  return (
    <Routes>
      <Route
        element={
          <AppFrame
            session={session}
            personas={personas}
            onSwitchPersona={onSwitchPersona}
            mode={mode}
            onToggleMode={onToggleMode}
            readiness={
              readiness.data?.state === 'ready'
                ? 'ready'
                : readiness.data?.state === 'not-ready'
                  ? 'not-ready'
                  : 'unknown'
            }
          />
        }
      >
        <Route index element={<HomePage session={session} personas={personas} />} />
        <Route path="_session" element={<SessionDebugPage session={session} />} />

        {/*
          A splat path is required for a remote: the remote renders its own
          <Routes> whose paths resolve relative to this mount point, which is
          what lets the same bundle mount at a different path without a rebuild.
        */}
        <Route
          path={`${catalog?.mountPath.slice(1) ?? 'catalog'}/*`}
          element={
            <RequireCapability
              need="catalog:browse"
              session={session}
              personas={personas}
              onSwitchPersona={onSwitchPersona}
            >
              <RemoteBoundary name="catalog">
                <CatalogRemote {...mountProps(catalog?.mountPath ?? '/catalog')} />
              </RemoteBoundary>
            </RequireCapability>
          }
        />

        <Route
          path={`${operations?.mountPath.slice(1) ?? 'ops'}/*`}
          element={
            <RequireCapability
              need="ops:view"
              session={session}
              personas={personas}
              onSwitchPersona={onSwitchPersona}
            >
              <RemoteBoundary name="operations">
                <OperationsRemote {...mountProps(operations?.mountPath ?? '/ops')} />
              </RemoteBoundary>
            </RequireCapability>
          }
        />

        <Route path="index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
