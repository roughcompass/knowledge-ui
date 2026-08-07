import {
  type RegistryClient,
  useArcReceipt,
  useArcReceiptExplanation,
} from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  CopyButton,
  EmptyState,
  ErrorPanel,
  FormRow,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  KLink,
  UnavailableNotice,
} from '@knowledge-ui/ui-kit';
import { Button, FlexLayout, Input, StackLayout, Text } from '@salt-ds/core';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ArcReceiptDetails = lazy(async () => {
  const page = await import('./ArcReceiptDetails');
  return { default: page.ArcReceiptDetails };
});

export function ArcReceiptPage() {
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const [draft, setDraft] = useState(receiptId ?? '');
  const [fieldError, setFieldError] = useState<string>();

  useEffect(() => setDraft(receiptId ?? ''), [receiptId]);

  const receipt = useArcReceipt(client, scope, receiptId);
  const explanation = useArcReceiptExplanation(client, scope, receiptId, {
    enabled: receipt.isSuccess,
  });

  const inspect = () => {
    const next = draft.trim();
    if (!UUID.test(next)) {
      setFieldError('Enter a complete receipt UUID.');
      return;
    }
    setFieldError(undefined);
    navigate(receiptId ? `../${next}` : next, { relative: 'path' });
  };

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="ARC Receipt Inspector"
        description="Inspect the retained evidence from a governed context resolution completed by a registered agent host."
        actions={
          <KLink to={receiptId ? '../..' : '..'} relative="path">
            Context Lab
          </KLink>
        }
      />

      <Note label="Recorded Explanation" variant="neutral">
        This explanation was recorded at run time and is not regenerated. This browser cannot issue
        ARC challenges, sign attestations, or rerun the resolution.
      </Note>

      <SectionCard
        title="Open a Receipt"
        description="Missing and unauthorized receipts both return “receipt not found” so the interface does not disclose whether another tenant’s UUID exists."
      >
        <StackLayout gap={2}>
          <FormRow
            label="Receipt UUID"
            required
            error={fieldError}
            helperText="Paste the UUID returned by a real ARC resolution."
          >
            <Input
              bordered
              value={draft}
              onChange={(event) => {
                setDraft((event.target as HTMLInputElement).value);
                setFieldError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') inspect();
              }}
            />
          </FormRow>
          <FlexLayout justify="end">
            <Button appearance="solid" sentiment="accented" onClick={inspect}>
              Inspect Receipt
            </Button>
          </FlexLayout>
        </StackLayout>
      </SectionCard>

      {!receiptId ? (
        /*
          A form asking for a UUID with no way to obtain one is a dead end, and this
          page was exactly that: nothing in the console produces a receipt id, and the
          registry publishes no list endpoint for receipts — only read-by-id. So the
          honest thing is to say where an id comes from rather than leave a reader
          guessing that they have missed a link somewhere.

          The named absence is the list itself. When a receipts index exists this
          becomes a table and the paste box becomes the fallback.
        */
        <StackLayout gap={3}>
          <EmptyState
            title="No Receipt Open"
            description="Paste a receipt UUID above. The inspector reads retained history; it does not construct or submit an ARC manifest."
          />
          <UnavailableNotice
            title="Receipts cannot be browsed"
            reason="The registry serves a receipt by id and publishes no index of them, so this console cannot offer a list to pick from. An id comes from the agent host that performed the resolution, or from the audit record of the request that produced it — not from anywhere in this app."
          />
        </StackLayout>
      ) : null}

      {/*
        Gated on `receiptId`, not on `isPending` alone.

        `useArcReceipt` is `enabled: Boolean(receiptId)`, and a disabled query in
        react-query v5 reports `isPending === true` — it is "pending" in the sense of
        having no data and no error, not in the sense of a request being in flight.
        So this rail destination rendered its empty state *and* a spinner labelled
        "Reading ARC receipt", forever, on a page where nothing had been asked for.
        The existing unit test asserted the empty state and the absence of the error,
        which is exactly the pair that leaves this visible.
      */}
      {receiptId && receipt.isPending ? <LoadingPanel label="Reading ARC receipt" /> : null}
      {receipt.error ? <ErrorPanel title="Receipt not available" error={receipt.error} /> : null}

      {receipt.data ? (
        <StackLayout gap={3}>
          <FlexLayout gap={1} align="center" justify="end">
            <Text color="secondary" styleAs="label">
              Receipt JSON
            </Text>
            <CopyButton
              value={JSON.stringify(receipt.data, null, 2)}
              label="Copy Receipt"
              aria-label={`Copy Receipt ${receipt.data.receipt_id}`}
            />
          </FlexLayout>

          <Suspense fallback={<LoadingPanel label="Preparing receipt details" />}>
            <ArcReceiptDetails receipt={receipt.data} events={explanation.data?.events} />
          </Suspense>

          {explanation.isPending ? <LoadingPanel label="Reading stored explanation" /> : null}
          {explanation.error ? (
            <ErrorPanel title="Stored explanation not available" error={explanation.error} />
          ) : null}
        </StackLayout>
      ) : null}
    </StackLayout>
  );
}
