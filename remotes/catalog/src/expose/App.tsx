import { SessionProvider } from '@knowledge-ui/auth';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import { Route, Routes } from 'react-router-dom';
import { RouterLinks } from '../RouterLinks';
import { lazy, Suspense } from 'react';
import { LoadingPanel } from '@knowledge-ui/ui-kit';

/**
 * Routes behind a dynamic import.
 *
 * Not premature optimisation — the bundle budget failed at 360.5 KB gz against 360,
 * and this remote's fetched total is the guard against a surface being added without
 * anyone noticing what it costs. `manualChunks` does nothing under Module Federation,
 * so a lazy route boundary is the only lever left.
 *
 * These five are the ones to move: the graph area and the context lab are distinct
 * product areas a reader enters deliberately, not the landing surface, and they are
 * the largest files in the remote. The catalog list and a capability's detail stay
 * eager, because they are where most sessions begin.
 */
const ContextLabPage = lazy(() =>
  import('../pages/ContextLabPage').then((m) => ({ default: m.ContextLabPage })),
);
const GraphAnalyticsPage = lazy(() =>
  import('../pages/GraphAnalyticsPage').then((m) => ({ default: m.GraphAnalyticsPage })),
);
const GraphOntologyPage = lazy(() =>
  import('../pages/GraphOntologyPage').then((m) => ({ default: m.GraphOntologyPage })),
);
const GraphProjectionsPage = lazy(() =>
  import('../pages/GraphProjectionsPage').then((m) => ({ default: m.GraphProjectionsPage })),
);
const CurationQueuePage = lazy(() =>
  import('../pages/CurationQueuePage').then((m) => ({ default: m.CurationQueuePage })),
);
const ArcReceiptPage = lazy(() =>
  import('../pages/ArcReceiptPage').then((m) => ({ default: m.ArcReceiptPage })),
);

import { CapabilityDetailPage } from '../pages/CapabilityDetailPage';
import { CapabilityListPage } from '../pages/CapabilityListPage';
import { ClaimsPage } from '../pages/ClaimsPage';
import { ClaimDetailPage } from '../pages/ClaimDetailPage';
import { GraphDashboardPage } from '../pages/GraphDashboardPage';
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
        hrefForRemote: props.hrefForRemote,
        personas: props.personas,
        onSwitchPersona: props.onSwitchPersona,
      }}
    >
      <RouterLinks>
        <Suspense fallback={<LoadingPanel label="Loading page" />}>
          <Routes>
            <Route index element={<CapabilityListPage />} />
            {/*
          Before the `:handle` route, or a visit to /notifications would match it
          as a capability slug and 404 against the detail endpoint.
        */}
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="claims" element={<ClaimsPage />} />
            {/*
            The citation drill-in `useClaim` was written for. The hook was typed and
            exported and no route rendered it, so the claims browser listed evidence
            counts that could not be opened.
          */}
            {/*
              Before `claims/:claimId`, or a visit to the queue matches it as a claim
              id and 404s against the detail endpoint. Same rule the notifications
              route above is ordered by.
            */}
            <Route path="claims/queue" element={<CurationQueuePage />} />
            <Route path="claims/:claimId" element={<ClaimDetailPage />} />
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
            {/*
            The tab is a path segment, so every view of a capability is a link a
            colleague can be sent and the accessibility and copy sweeps can visit.
          */}
            <Route path=":handle/:tab" element={<CapabilityDetailPage />} />
          </Routes>
        </Suspense>
      </RouterLinks>
    </SessionProvider>
  );
}
