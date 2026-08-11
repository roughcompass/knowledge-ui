import {
  Banner,
  BannerContent,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  RadioButton,
  RadioButtonGroup,
  StackLayout,
  Text,
} from '@salt-ds/core';
import { RegistryError, type RegistryClient } from '@knowledge-ui/api-client';
import { toSession, type Session } from '@knowledge-ui/auth';
import { ErrorPanel, LoadingPanel } from '@knowledge-ui/ui-kit';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';

/**
 * Turns a bearer token into a resolved session, handling every way that can fail.
 *
 * Four outcomes, each with a different correct response, and getting them
 * confused is the difference between a usable dev loop and twenty minutes of
 * guessing:
 *
 *   200                     -> a session
 *   400 tenant_required     -> the principal has several tenant grants and must
 *                              pick one; the choices are inside errors[0]
 *   401                     -> the token lapsed; re-mint once and retry
 *   403 "access denied"     -> almost always an unseeded entitlement
 *
 * The 403 case deserves its own explanation. The entitlement service stores
 * seeds in memory, so they vanish on every container restart, and the API's
 * refusal carries no hint about why — just "access denied". Without naming the
 * likely cause and the command that fixes it, that error sends people reading
 * authorisation code instead of re-running a script.
 */

export interface SessionBootstrapProps {
  client: RegistryClient;
  personaKey: string;
  /** Called with the chosen slug so the client starts sending the tenant header. */
  onTenantSelected: (slug: string) => void;
  /** Re-mint and retry. Returns true when a new token was obtained. */
  onReauthenticate: () => Promise<boolean>;
  children: (session: Session) => ReactNode;
}

interface WhoamiRaw {
  actor_id: string;
  actor_display_name: string | null;
  actor_email: string | null;
  tenant_id: string;
  tenant_slug: string;
  tenant_display_name: string;
  roles: string[];
}

export function SessionBootstrap({
  client,
  personaKey,
  onTenantSelected,
  onReauthenticate,
  children,
}: SessionBootstrapProps) {
  const [retriedAuth, setRetriedAuth] = useState(false);

  const query = useQuery({
    // Not the shared key factory: that factory needs a tenant slug, and
    // resolving the tenant is what this request is for.
    queryKey: ['kui', personaKey, 'bootstrap', 'whoami'],
    queryFn: ({ signal }) => client.request<WhoamiRaw>('/v1/whoami', { signal }),
    // Every failure here is either terminal or handled explicitly below, so a
    // blind retry only delays the explanation.
    retry: false,
    staleTime: 5 * 60_000,
  });

  const handleTenantChoice = useCallback(
    (slug: string) => {
      onTenantSelected(slug);
      void query.refetch();
    },
    [onTenantSelected, query],
  );

  if (query.isPending) return <LoadingPanel label="Resolving your session" />;

  if (query.error) {
    const error = query.error;

    if (error instanceof RegistryError) {
      if (error.is('tenant_required')) {
        return <TenantPicker tenants={error.availableTenants} onSelect={handleTenantChoice} />;
      }

      if (error.status === 401 && !retriedAuth) {
        // One attempt, then give up. Looping on a token the provider keeps
        // producing would be an invisible infinite retry.
        setRetriedAuth(true);
        void onReauthenticate().then((minted) => {
          if (minted) void query.refetch();
        });
        return <LoadingPanel label="Refreshing your credentials" />;
      }

      if (error.status === 403) {
        return <SeedDiagnostic personaKey={personaKey} message={error.message} />;
      }
    }

    return (
      <ErrorPanel
        error={error}
        title="Could not resolve your session"
        action={
          <Button appearance="bordered" sentiment="neutral" onClick={() => void query.refetch()}>
            Try Again
          </Button>
        }
      />
    );
  }

  let session: Session;
  try {
    session = toSession(query.data, personaKey);
  } catch (conversionError) {
    // A role the UI does not know. Rendering anything would mean guessing at a
    // permission set, so this stops here.
    return <ErrorPanel error={conversionError} title="Unrecognised identity" />;
  }

  return <>{children(session)}</>;
}

/**
 * Shown only after the server has told us a choice is required, and populated
 * from the list it supplied.
 *
 * Note the header is sent only after this choice: a tenant header that does not
 * match a single-grant principal's own tenant is a 403, not a graceful fallback,
 * so guessing would lock the reader out.
 */
function TenantPicker({
  tenants,
  onSelect,
}: {
  tenants: string[];
  onSelect: (slug: string) => void;
}) {
  const [choice, setChoice] = useState(tenants[0] ?? '');

  return (
    <Dialog open>
      <DialogHeader header="Choose a tenant" />
      <DialogContent>
        <StackLayout gap={2}>
          <Text>
            This identity has access to more than one tenant, so the contextplane cannot pick for
            you.
          </Text>
          <RadioButtonGroup value={choice} onChange={(event) => setChoice(event.target.value)}>
            {tenants.map((slug) => (
              <RadioButton key={slug} label={slug} value={slug} />
            ))}
          </RadioButtonGroup>
          <Button sentiment="accented" disabled={choice === ''} onClick={() => onSelect(choice)}>
            Continue as {choice || '…'}
          </Button>
        </StackLayout>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The 403 explainer.
 *
 * Exists because the API's refusal is a bare "access denied" and the overwhelmingly
 * most likely cause locally is that the entitlement store was emptied by a
 * container restart. Naming the identity and printing the command turns a
 * dead end into one line in a terminal.
 */
function SeedDiagnostic({ personaKey, message }: { personaKey: string; message: string }) {
  return (
    <Banner status="warning" role="alert">
      <BannerContent>
        <StackLayout gap={1}>
          <Text styleAs="label">The contextplane refused this identity</Text>
          <Text>{message}</Text>
          <Text>
            The persona{' '}
            <Text as="span" styleAs="label">
              {personaKey}
            </Text>{' '}
            authenticated successfully, so the token is fine — the contextplane has no entitlements
            recorded for it. The entitlement service keeps those in memory, so they are lost
            whenever its container restarts.
          </Text>
          <Text styleAs="code">npm run seed:personas</Text>
        </StackLayout>
      </BannerContent>
    </Banner>
  );
}
