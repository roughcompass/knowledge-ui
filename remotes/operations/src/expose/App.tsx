import { RequireCapability, SessionProvider, useSession } from '@knowledge-ui/auth';
import type { RegistryClient } from '@knowledge-ui/api-client';
import type { Session } from '@knowledge-ui/auth';
import type { RemoteMountProps } from '@knowledge-ui/remote-contract';
import { Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

import { OperationsLayout } from '../pages/OperationsLayout';
import { AuditLogPage } from '../pages/AuditLogPage';
import { HealthPage } from '../pages/HealthPage';
import { MetricsPage } from '../pages/MetricsPage';
import { SyncRunsPage } from '../pages/SyncRunsPage';
import { SyncSourcesPage } from '../pages/SyncSourcesPage';
import { UsagePage } from '../pages/UsagePage';

/**
 * The federated entry point for the platform screens.
 *
 * Health and metrics are grouped with the audit log and the sync screens for the
 * reader's benefit, not because they share a permission. Those two endpoints are
 * unauthenticated; the audit log is the most restricted surface in the API; and the
 * sync screens are admin-only. Three different permissions in one section, so each
 * page that needs more than the mount does gates itself and says why.
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
          <Route path="usage" element={<UsagePage />} />
          <Route path="audit" element={<GuardedAuditLog />} />
          {/*
            Relative paths, so the section can be remounted elsewhere without a
            rebuild. `sync/runs` is a sibling route rather than a nested one: it is
            a separate destination in the rail, not a detail view of `sync`.
          */}
          <Route
            path="sync"
            element={
              <GuardedAdmin>
                <SyncSourcesPage />
              </GuardedAdmin>
            }
          />
          <Route
            path="sync/runs"
            element={
              <GuardedAdmin>
                <SyncRunsPage />
              </GuardedAdmin>
            }
          />
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

/**
 * The operator screens' gate.
 *
 * Same shape and same reason as `GuardedAuditLog`, one level stricter: every
 * `/v1/admin/*` endpoint behind these pages is `require_roles([ROLE_ADMIN])`, while
 * the section's own `ops:view` is held by every role. Without this an auditor would
 * reach a page that renders its table frame and then fills it with 403s.
 *
 * Takes children rather than naming a page, because there are two of them and the
 * gate has nothing to say about which.
 */
function GuardedAdmin({ children }: { children: ReactNode }) {
  const { session, personas, onSwitchPersona } = useSession();
  return (
    <RequireCapability
      need="admin:manage"
      session={session}
      personas={personas}
      onSwitchPersona={onSwitchPersona}
    >
      {children}
    </RequireCapability>
  );
}
