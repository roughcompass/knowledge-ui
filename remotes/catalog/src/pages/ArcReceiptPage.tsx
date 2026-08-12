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
      setFieldError('Enter the full receipt ID in UUID format.');
      return;
    }
    setFieldError(undefined);
    navigate(receiptId ? `../${next}` : next, { relative: 'path' });
  };

  return (
    <StackLayout gap={3}>
      <PageHeader
        eyebrow="Context testing"
        title="Run Receipt Inspector"
        description="Trace why an agent host selected or omitted context during a completed run. Paste the receipt ID returned by the host."
        actions={
          <KLink to={receiptId ? '../..' : '..'} relative="path">
            Retrieval Tests
          </KLink>
        }
      />

      <Note label="What This Inspector Shows" variant="neutral">
        The receipt preserves selection decisions and event history from the original run. This page
        cannot rerun or change the resolution.
      </Note>

      <SectionCard
        title="Find a Run Receipt"
        description="Get the receipt ID from the agent host that performed the run or from the request's audit record."
      >
        <StackLayout gap={2}>
          <FormRow
            label="Receipt ID"
            required
            error={fieldError}
            helperText="Paste the complete ID. Missing and unauthorized receipt IDs both return “receipt not found.”"
          >
            <Input
              bordered
              value={draft}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
          contextplane publishes no list endpoint for receipts — only read-by-id. So the
          honest thing is to say where an id comes from rather than leave a reader
          guessing that they have missed a link somewhere.

          The named absence is the list itself. When a receipts index exists this
          becomes a table and the paste box becomes the fallback.
        */
        <StackLayout gap={3}>
          <EmptyState
            title="Paste a Receipt ID to Begin"
            description="The inspector reads a completed run's retained history. It does not create or submit a new context request."
          />
          <UnavailableNotice
            title="No receipt list is available"
            reason="The service can retrieve a receipt by ID but does not publish a receipt index. This console cannot offer a list to browse."
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
      {receiptId && receipt.isPending ? <LoadingPanel label="Reading run receipt" /> : null}
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
