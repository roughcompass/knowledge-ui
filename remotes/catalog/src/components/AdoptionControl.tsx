import { Button, FlexLayout, Tag, Text } from '@salt-ds/core';
import {
  useAdopt,
  useAdoption,
  useUnadopt,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import { ActionResult, ConfirmDialog } from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * Adopt or unadopt the capability being read, and say which it is.
 *
 * This lives on the detail page rather than in the consumer remote because the
 * whole point is acting on the thing already in front of you; sending a reader
 * somewhere else to declare a dependency on what they are currently looking at
 * would be worse than not offering it.
 *
 * **State comes from the server, never from the last mutation.** The button
 * renders from a read of `GET /v1/capabilities/{id}/adoptions`, and a successful
 * write invalidates that read rather than seeding it. A POST that succeeded and
 * was then reversed by a teammate must not leave this button claiming a state
 * that no longer holds, and there is no local edit here that could.
 *
 * **Adoption is tenant-granular.** The API records it against the calling
 * tenant, with team attribution carried as free text in `intent`. So the copy
 * says "your tenant", never "your team" — implying per-team adoption would
 * describe a distinction the server does not make.
 *
 * **Reading and writing have different role gates, and they are not symmetric.**
 * `list_adoptions` admits producer, admin, consumer and auditor; adopt and
 * unadopt are `require_roles([ROLE_PRODUCER, ROLE_ADMIN])` and exclude consumer
 * outright. So every role can see whether their tenant has adopted, and only a
 * producer or admin can change it. The control renders the state to everyone and
 * offers the action only to principals the API would accept — offering a button
 * that is guaranteed to 403 is worse than not showing it, and the registry
 * collapses a principal to exactly one role, so a consumer cannot escalate by
 * also holding producer.
 */
export function AdoptionControl({ handle }: { handle: string }) {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  /*
   * Mirrors `_adopt_required` in `adoptions.py`, which is producer-or-admin and
   * excludes consumer. Read stays open to every role via `_list_adoptions_required`.
   */
  const canChange = session.role === 'producer' || session.role === 'admin';

  const adoption = useAdoption(client, scope, handle);
  const adopt = useAdopt(client, scope);
  const unadopt = useUnadopt(client, scope);
  const [confirming, setConfirming] = useState(false);

  /*
   * Pending is deliberately not an error state and not an empty one. Rendering
   * "Adopt" while the read is in flight would offer an action that may be wrong
   * a moment later, and flipping the label once the response lands is the kind
   * of shift that makes a reader distrust the page.
   */
  if (adoption.isPending) {
    return (
      <Button appearance="bordered" sentiment="neutral" disabled>
        Checking adoption…
      </Button>
    );
  }

  /*
   * A failed read is reported, not swallowed into "not adopted". Those are
   * different facts, and guessing the friendlier one is how a UI ends up
   * offering Adopt to someone who has already adopted.
   */
  if (adoption.error) {
    return (
      <ActionResult error={adoption.error} errorTitle="Could not read adoption state" />
    );
  }

  const current = adoption.data;

  if (current) {
    return (
      <>
        <FlexLayout gap={1} align="center">
          <Tag>Adopted{current.version_pin ? ` · pinned ${current.version_pin}` : ''}</Tag>
          {!canChange ? null : (
          <Button
            appearance="bordered"
            sentiment="caution"
            onClick={() => setConfirming(true)}
            disabled={unadopt.isPending}
          >
            Unadopt
          </Button>
          )}
        </FlexLayout>

        <ConfirmDialog
          open={confirming}
          title="Unadopt this capability?"
          confirmLabel="Unadopt"
          busy={unadopt.isPending}
          error={unadopt.error}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            unadopt.mutate(
              { capabilityHandle: handle, adoptionId: current.adoption_id },
              { onSuccess: () => setConfirming(false) },
            )
          }
        >
          <Text>
            Your tenant stops declaring a dependency on this capability, and stops appearing
            in its provider projection. The adoption record itself is preserved in the audit
            log — this is reversible, and it is not a deletion.
          </Text>
          <Text>
            {/*
              Adopting creates an inbox subscription automatically, and unadopting does
              not remove it: `unadopt` soft-deletes the adoption row and nothing else.
              Saying so here is the difference between a reversible action and one that
              quietly leaves something behind.
            */}
            You will keep receiving notifications for it. Adopting created an inbox
            subscription, and unadopting does not remove one — cancel it from
            Subscriptions if you no longer want the updates.
          </Text>
        </ConfirmDialog>
      </>
    );
  }

  if (!canChange) {
    /*
     * Not an error and not an empty state: the reader is entitled to know their
     * tenant has not adopted this, they are simply not the principal who can
     * change it. Saying which role can turns a dead end into a next step.
     */
    return <Text color="secondary">Not adopted · a producer or admin can adopt</Text>;
  }

  return (
    <FlexLayout gap={1} align="center">
      <Button
        appearance="solid"
        sentiment="accented"
        onClick={() => adopt.mutate({ capabilityHandle: handle })}
        disabled={adopt.isPending}
      >
        {adopt.isPending ? 'Adopting…' : 'Adopt'}
      </Button>
      {adopt.error ? <ActionResult error={adopt.error} errorTitle="Could not adopt" /> : null}
    </FlexLayout>
  );
}
