import { SessionProvider } from '@knowledge-ui/auth';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import { Route, Routes } from 'react-router-dom';
import { RouterLinks } from '../RouterLinks';

import { ArcReceiptPage } from '../pages/ArcReceiptPage';
import { CapabilityDetailPage } from '../pages/CapabilityDetailPage';
import { CapabilityListPage } from '../pages/CapabilityListPage';
import { ClaimsPage } from '../pages/ClaimsPage';
import { ContextLabPage } from '../pages/ContextLabPage';
import { GraphDashboardPage } from '../pages/GraphDashboardPage';
import { GraphOntologyPage } from '../pages/GraphOntologyPage';
import { GraphAnalyticsPage } from '../pages/GraphAnalyticsPage';
import { GraphProjectionsPage } from '../pages/GraphProjectionsPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { WorkspaceDetailPage } from '../pages/WorkspaceDetailPage';
import { WorkspacesPage } from '../pages/WorkspacesPage';

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
      <RouterLinks>
        <Routes>
          <Route index element={<CapabilityListPage />} />
          {/*
          Before the `:handle` route, or a visit to /notifications would match it
          as a capability slug and 404 against the detail endpoint.
        */}
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="claims" element={<ClaimsPage />} />
          <Route path="context" element={<ContextLabPage />} />
          <Route path="context/receipts" element={<ArcReceiptPage />} />
          <Route path="context/receipts/:receiptId" element={<ArcReceiptPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
          {/* Same rule as notifications: before `:handle`, or /graph is a slug. */}
          <Route path="graph" element={<GraphDashboardPage />} />
          <Route path="graph/projections" element={<GraphProjectionsPage />} />
          <Route path="graph/analytics" element={<GraphAnalyticsPage />} />
          <Route path="graph/ontology" element={<GraphOntologyPage />} />
          <Route path=":handle" element={<CapabilityDetailPage />} />
        </Routes>
      </RouterLinks>
    </SessionProvider>
  );
}
