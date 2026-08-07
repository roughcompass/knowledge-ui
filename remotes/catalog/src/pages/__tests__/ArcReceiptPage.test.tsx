import { createRegistryClient } from '@knowledge-ui/api-client';
import {
  ARC_READY_RECEIPT_ID,
  ARC_REDACTED_RECEIPT_ID,
  makeSession,
  renderWithProviders,
} from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ArcReceiptPage } from '../ArcReceiptPage';

const token = `header.${btoa(
  JSON.stringify({ sub: 'knowledge-ui-consumer', exp: 9999999999 }),
)}.signature`;

function renderReceipt(receiptId?: string) {
  const path = receiptId ? `/context/receipts/${receiptId}` : '/context/receipts';
  return renderWithProviders(
    <Routes>
      <Route path="/context/receipts" element={<ArcReceiptPage />} />
      <Route path="/context/receipts/:receiptId" element={<ArcReceiptPage />} />
    </Routes>,
    {
      route: path,
      session: makeSession(),
      client: createRegistryClient({
        baseUrl: 'http://localhost',
        getToken: () => token,
      }),
    },
  );
}

describe('the ARC receipt inspector', () => {
  it('reads the retained receipt and its stored event-chain explanation', async () => {
    renderReceipt(ARC_READY_RECEIPT_ID);

    expect(screen.getByText(/recorded at run time and is not regenerated/i)).toBeInTheDocument();
    expect(await screen.findByText('Resolution Record')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Rendered Content Bytes')).toBeInTheDocument();
    expect(screen.getByText('Budget Limit Bytes')).toBeInTheDocument();
    expect(screen.getByText('registry://directives/change-control')).toBeInTheDocument();

    expect(await screen.findByText('Event Chain')).toBeInTheDocument();
    expect(screen.getByText(/Resolution created/i)).toBeInTheDocument();
    expect(screen.getByText(/Directive omitted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign|challenge|resolve manifest/i })).toBeNull();
  });

  it('names audience redaction without hiding the non-source receipt fields', async () => {
    renderReceipt(ARC_REDACTED_RECEIPT_ID);

    expect(await screen.findByText('Source Redacted')).toBeInTheDocument();
    expect(screen.getAllByText('Redacted by audience policy')).toHaveLength(3);
    expect(screen.getByText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeInTheDocument();
    expect(screen.getByText(/source detail audience limited/i)).toBeInTheDocument();
  });

  it('preserves the backend’s indistinguishable not-found response', async () => {
    renderReceipt('33333333-3333-4333-8333-333333333333');

    expect(await screen.findByText('Receipt not available')).toBeInTheDocument();
    expect(screen.getAllByText(/receipt not found/i)).toHaveLength(2);
    expect(screen.queryByText('Stored explanation not available')).not.toBeInTheDocument();
  });

  it('does not treat the empty form as a failed receipt query', () => {
    renderReceipt();

    expect(screen.getByText('No Receipt Open')).toBeInTheDocument();
    expect(screen.queryByText('Receipt not available')).not.toBeInTheDocument();

    /*
      The assertion that was missing, and why it mattered: a disabled react-query
      query reports `isPending === true`, so this route rendered its empty state and
      a spinner at the same time, permanently. Checking only for the empty state and
      the absence of an error is precisely the pair that leaves that invisible.
    */
    expect(screen.queryByText('Reading ARC receipt')).not.toBeInTheDocument();
  });
});
