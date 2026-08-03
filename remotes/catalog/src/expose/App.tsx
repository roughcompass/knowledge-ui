import { SessionProvider } from '@knowledge-ui/auth';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import { Route, Routes } from 'react-router-dom';

import { CapabilityDetailPage } from '../pages/CapabilityDetailPage';
import { CapabilityListPage } from '../pages/CapabilityListPage';

/**
 * The federated entry point.
 *
 * Provides no theme, no query client and no router — the host owns all three,
 * and this component renders inside them. Wrapping again would produce a nested
 * theme scope and a second, empty cache that nothing else can see.
 *
 * Routes are relative, so this bundle does not know or care that it is mounted
 * at /catalog. That is what allows the mount path to change without a rebuild.
 */
export default function CatalogApp(props: RemoteMountProps<Session, RegistryClient>) {
  return (
    <SessionProvider
      value={{
        session: props.session,
        client: props.client,
        mountPath: props.mountPath,
        navigateAbsolute: props.navigateAbsolute,
        personas: props.personas,
        onSwitchPersona: props.onSwitchPersona,
      }}
    >
      <Routes>
        <Route index element={<CapabilityListPage />} />
        <Route path=":handle" element={<CapabilityDetailPage />} />
      </Routes>
    </SessionProvider>
  );
}
