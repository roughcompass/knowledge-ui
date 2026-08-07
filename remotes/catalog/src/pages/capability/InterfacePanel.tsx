import { StackLayout, Text } from '@salt-ds/core';
import { useCapabilityInterface, type RegistryClient } from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  CopyButton,
  DescriptionList,
  ErrorPanel,
  LoadingPanel,
  SectionCard,
  UnavailableNotice,
  displayText,
  instantText,
  termText,
} from '@knowledge-ui/ui-kit';

/**
 * The capability's declared contract.
 *
 * The orientation document promises a consuming team "what its contract is", and the
 * console never asked for it — the endpoint has existed the whole time with no client
 * and no surface, so the single question a team asks before depending on something
 * was the one this app could not answer. It was the largest promised-but-missing
 * surface in the product.
 *
 * Three states are distinguished on purpose, because collapsing them is the defect
 * this repo's own honesty rules name:
 *
 * - **No contract declared.** Normal, and true of most capabilities. It is an
 *   absence of a declaration, not a failure and not an empty contract.
 * - **Not readable by this role.** A refusal, said as one.
 * - **The read failed.** An error, said as one.
 *
 * `recordedInterface` is the capability's own `interface` attribute, handed down
 * from the detail response the page already holds. The registry has two sources
 * for a contract — canonical published interface text, and an attribute recorded
 * on the capability — and they stay labelled apart here, because a reader
 * deciding whether to depend on something needs to know which one they read.
 */
export function InterfacePanel({
  handle,
  recordedInterface,
}: {
  handle: string;
  recordedInterface?: unknown;
}) {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useCapabilityInterface(client, scope, handle);

  if (query.isPending) return <LoadingPanel label="Reading the interface" />;

  /*
   * A capability with no declared interface answers 404, which is the same status a
   * missing capability answers — but the capability is on screen, so the only reading
   * left is that it declares no contract. Anything else is a real failure.
   */
  const status = (query.error as { status?: number } | null)?.status;
  if (status === 404) {
    return (
      <UnavailableNotice
        title="No interface declared"
        reason="This capability publishes no contract. That is an absence of a declaration rather than an empty one — nothing has been registered against it, so there is nothing here to be out of date."
      />
    );
  }
  if (status === 403) {
    return (
      <UnavailableNotice
        title="The interface is not readable by this role"
        reason="The contract is published, and this identity is not permitted to read it."
      />
    );
  }
  if (query.error) return <ErrorPanel title="Interface not available" error={query.error} />;

  const data = query.data ?? {};
  const canonical = typeof data.interface_canonical === 'string' ? data.interface_canonical : '';
  const hasRecorded =
    recordedInterface !== undefined &&
    recordedInterface !== null &&
    (typeof recordedInterface !== 'string' || recordedInterface.trim() !== '');

  const provenance = (
    [
      ['interface_format', data.interface_format],
      ['interface_source', data.interface_source],
      ['ingested_at', data.ingested_at],
      ['valid_from', data.valid_from],
      ['valid_to', data.valid_to],
    ] as const
  ).filter(([, value]) => value !== undefined && value !== null);

  return (
    <SectionCard
      title="Interface"
      description="The contract this capability declares. What a consuming team reads before depending on it."
      action={canonical ? <CopyButton value={canonical} label="Copy Interface" /> : undefined}
      banded
    >
      {provenance.length > 0 ? (
        <DescriptionList
          caption="Interface provenance"
          hideCaption
          items={provenance.map(([key, value]) => ({
            term: termText(key),
            detail: (
              <Text>
                {key === 'ingested_at' || key === 'valid_from' || key === 'valid_to'
                  ? instantText(value)
                  : displayText(value)}
              </Text>
            ),
          }))}
        />
      ) : null}

      {canonical ? (
        // The canonical text in the code face, unmodified. A contract is read
        // literally — reformatting it here would mean the console and the registry
        // disagree about what was declared.
        <Text styleAs="code">{canonical}</Text>
      ) : hasRecorded ? (
        // The recorded attribute is still the server's value, rendered literally —
        // compact JSON when it is structured — with its source said first, so it
        // cannot be mistaken for published interface text.
        <StackLayout gap={1}>
          <Text color="secondary">
            No canonical interface text was published. What follows is the interface attribute
            recorded on the capability itself.
          </Text>
          <Text styleAs="code">
            {typeof recordedInterface === 'string'
              ? recordedInterface
              : JSON.stringify(recordedInterface)}
          </Text>
        </StackLayout>
      ) : provenance.length > 0 ? (
        <Text color="secondary">
          The response carried no canonical interface text. The provenance above is what was
          published.
        </Text>
      ) : (
        <Text color="secondary">
          The registry has no interface text recorded for this capability.
        </Text>
      )}
    </SectionCard>
  );
}
