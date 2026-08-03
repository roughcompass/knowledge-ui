import { RequireCapability, SessionProvider, useSession } from '@knowledge-ui/auth';
import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import { Route, Routes } from 'react-router-dom';

import { OperationsLayout } from '../pages/OperationsLayout';
import { AuditLogPage } from '../pages/AuditLogPage';
import { HealthPage } from '../pages/HealthPage';
import { MetricsPage } from '../pages/MetricsPage';

/**
 * The federated entry point for the platform screens.
 *
 * Health and metrics are grouped with the audit log for the reader's benefit,
 * not because they share a permission: those two endpoints are unauthenticated,
 * while the audit log is the most restricted surface in the API. The pages say
 * so, because a grouping that implies a shared permission would send someone
 * looking for an access problem that does not exist.
 */
export default function OperationsApp(props: RemoteMountProps<Session, RegistryClient>) {
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
        <Route element={<OperationsLayout />}>
          <Route index element={<HealthPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="audit" element={<GuardedAuditLog />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}

/**
 * The audit log's own gate.
 *
 * The host mounts this remote behind `ops:view`, which health and metrics need
 * and every role has. The audit log needs `audit:read`, which only the auditor
 * role carries, and the host has no reason to know that a child route of this
 * remote is more restricted than its mount.
 *
 * Without this the page rendered its filters and an empty table, because the
 * query was disabled but the layout was not — a permission boundary that looked
 * exactly like a tenant with no audit history.
 */
function GuardedAuditLog() {
  const { session, personas, onSwitchPersona } = useSession();
  return (
    <RequireCapability
      need="audit:read"
      session={session}
      personas={personas}
      onSwitchPersona={onSwitchPersona}
    >
      <AuditLogPage />
    </RequireCapability>
  );
}
