import { Banner, BannerContent, Button, FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { can, rolesGranting, type Capability } from './capabilities';
import type { Persona } from './personas';
import type { Session } from './types';

/**
 * Gate a route on a capability, explaining rather than redirecting.
 *
 * A redirect to a generic "forbidden" page throws away the only useful
 * information: which role would work, and whether the reader can become it. That
 * matters most for the audit log, where being refused is not a mistake — the
 * server collapses a principal's grants to one role and guards that endpoint on
 * auditor specifically, so an admin is *correctly* refused and the fix is to
 * authenticate as someone else.
 *
 * Offering that switch inline turns the most confusing permission in the system
 * into a button.
 *
 * Lives in this package rather than in the shell because remotes need it too. A
 * remote gates its own sub-routes — the host mounts `/ops` behind `ops:view`, but
 * only the operations remote knows that its `audit` child needs `audit:read` —
 * and a guard the remote cannot import leaves that route ungated, which renders
 * as an empty table rather than as a permission boundary.
 */
export function RequireCapability({
  need,
  session,
  personas,
  onSwitchPersona,
  children,
}: {
  need: Capability;
  session: Session;
  personas: readonly Persona[];
  onSwitchPersona?: ((personaKey: string) => void) | undefined;
  children: ReactNode;
}) {
  if (can(session, need)) return <>{children}</>;

  const grantingRoles = rolesGranting(need);
  // Only offer a persona that would actually succeed. Suggesting one that also
  // lacks the capability would be worse than suggesting nothing.
  const suggestion = personas.find((p) => grantingRoles.includes(p.expectedRole));

  return (
    <Banner status="info" role="alert">
      <BannerContent>
        <StackLayout gap={1}>
          <Text styleAs="label">Not available to this role</Text>
          <Text>
            This screen needs {grantingRoles.map((r) => `the ${r} role`).join(' or ')}. You are
            signed in with the <strong>{session.role}</strong> role.
          </Text>
          {need === 'audit:read' ? (
            <Text color="secondary">
              The registry grants exactly one role per session, and the audit log requires the
              auditor role specifically — so an administrator is refused here by design, not by
              misconfiguration.
            </Text>
          ) : null}
          {suggestion && onSwitchPersona ? (
            // Wrapped in a start-aligned row so the button sizes to its label. A
            // Button is a block-level flex child of the StackLayout above, so on
            // its own it stretched to the full width of the banner — a 1240px
            // primary action.
            <FlexLayout justify="start">
              <Button sentiment="accented" onClick={() => onSwitchPersona(suggestion.key)}>
                Switch to {suggestion.label}
              </Button>
            </FlexLayout>
          ) : null}
        </StackLayout>
      </BannerContent>
    </Banner>
  );
}
