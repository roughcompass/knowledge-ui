import { FlowLayout, StackLayout, Text } from '@salt-ds/core';
import {
  can,
  capabilitiesFor,
  type Capability,
  type Persona,
  type Session,
} from '@knowledge-ui/auth';
import { NavCard, PageHeader, Prose } from '@knowledge-ui/ui-kit';
import { useHref, useNavigate } from 'react-router-dom';

import { REMOTES, type RemoteDescriptor } from '../remotes/registry';

/**
 * The landing page, which doubles as documentation of the permission model.
 *
 * Showing what the current role unlocks — and what it does not — is worth more
 * than a generic welcome. It is also where the audit-log constraint gets
 * explained before someone hits it: the reason an administrator cannot read the
 * audit log is a server property, and meeting that fact on a 403 is worse than
 * meeting it here.
 */
export function HomePage({
  session,
  personas,
}: {
  session: Session;
  personas: readonly Persona[];
}) {
  const navigate = useNavigate();
  const available = REMOTES.filter((r) => can(session, r.need as Capability));
  const unavailable = REMOTES.filter((r) => !can(session, r.need as Capability));
  const auditorPersona = personas.find((p) => p.expectedRole === 'auditor');

  return (
    <StackLayout gap={3}>
      <PageHeader
        title={`Signed in as ${session.actorDisplayName ?? session.actorId}`}
        description={
          <>
            Tenant <strong>{session.tenantDisplayName}</strong> · role{' '}
            <strong>{session.role}</strong>
          </>
        }
      />

      <StackLayout gap={1}>
        <Text styleAs="h4" as="h2">
          Available to you
        </Text>
        <FlowLayout gap={2}>
          {available.map((remote) => (
            <RemoteCard key={remote.name} remote={remote} onNavigate={navigate} />
          ))}
        </FlowLayout>
      </StackLayout>

      {unavailable.length > 0 ? (
        <StackLayout gap={1}>
          <Text styleAs="h4" as="h2">
            Not available to this role
          </Text>
          <FlowLayout gap={2}>
            {unavailable.map((remote) => (
              <StackLayout key={remote.name} gap={1}>
                <Text styleAs="label" color="secondary">
                  {remote.label}
                </Text>
                <Text color="secondary">{remote.description}</Text>
              </StackLayout>
            ))}
          </FlowLayout>
        </StackLayout>
      ) : null}

      {session.role !== 'auditor' && auditorPersona ? (
        <StackLayout gap={1}>
          <Text styleAs="h4" as="h2">
            About the audit log
          </Text>
          <Prose>
            <Text color="secondary">
              The registry grants exactly one role per session and resolves it by precedence, with
              administrator above auditor. The audit endpoint requires the auditor role
              specifically, so an identity holding both is resolved to administrator and refused.
              Reading the audit log means signing in as <strong>{auditorPersona.label}</strong> —
              the switcher in the header does that in one step.
            </Text>
          </Prose>
        </StackLayout>
      ) : null}

      <StackLayout gap={1}>
        <Text styleAs="h4" as="h2">
          Permissions carried by this role
        </Text>
        <Text styleAs="notation" color="secondary">
          {capabilitiesFor(session.role).join(' · ')}
        </Text>
      </StackLayout>
    </StackLayout>
  );
}

/**
 * Binds `NavCard` to this app's router.
 *
 * The card itself is router-free — ui-kit takes no react-router dependency — so
 * resolving the path against the basename and performing the navigation are the
 * host's job. That is the whole of this adapter.
 */
function RemoteCard({
  remote,
  onNavigate,
}: {
  remote: RemoteDescriptor;
  onNavigate: (to: string) => void;
}) {
  return (
    <NavCard
      href={useHref(remote.mountPath)}
      onNavigate={() => onNavigate(remote.mountPath)}
      title={remote.label}
      description={remote.description}
    />
  );
}
