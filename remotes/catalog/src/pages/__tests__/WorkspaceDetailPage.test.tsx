import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders, resetWorkspaceStore } from '@knowledge-ui/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { WorkspaceDetailPage } from '../WorkspaceDetailPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderAs = (role: 'producer' | 'admin' | 'consumer' | 'auditor', workspaceId: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
    </Routes>,
    {
      route: `/workspaces/${workspaceId}`,
      session: makeSession({ role, personaKey: role }),
      client: createRegistryClient({
        baseUrl: 'http://localhost',
        getToken: () => tokenFor(`knowledge-ui-${role}`),
      }),
    },
  );

beforeEach(() => {
  resetWorkspaceStore();
});

describe('visibility', () => {
  it('names the absence rather than showing a control that cannot work', async () => {
    renderAs('admin', 'ws-team');
    expect(
      await screen.findByText('Visibility cannot be changed after creation'),
    ).toBeInTheDocument();
    // The reason has to be the API's shape, not a permission — a reader who
    // thinks it is a permission will go and ask someone for it.
    expect(screen.getByText(/accepts a name, a description and an archive/i)).toBeInTheDocument();
  });
});

describe('entries', () => {
  it('lists what is written in the workspace', async () => {
    renderAs('admin', 'ws-team');
    expect(await screen.findByText(/standardise on the Salt design system/)).toBeInTheDocument();
    expect(screen.getByText(/keep its v2 surface/)).toBeInTheDocument();
  });

  it('filters by kind through the server', async () => {
    const user = userEvent.setup();
    renderAs('admin', 'ws-team');

    await screen.findByText(/standardise on the Salt design system/);
    await user.click(screen.getByRole('combobox', { name: /kind/i }));
    await user.click(await screen.findByRole('option', { name: 'Open question' }));

    await waitFor(() => {
      expect(screen.queryByText(/standardise on the Salt design system/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/keep its v2 surface/)).toBeInTheDocument();
  });

  it('adds an entry and shows it back from the server', async () => {
    const user = userEvent.setup();
    renderAs('admin', 'ws-team');

    await user.click(await screen.findByRole('button', { name: 'Add Entry' }));
    await user.type(screen.getByRole('textbox', { name: /body/i }), 'Check the retention policy.');
    await user.click(screen.getByRole('button', { name: 'Add Entry' }));

    expect(await screen.findByText('Check the retention policy.')).toBeInTheDocument();
  });

  it('surfaces the scanner’s warning when one comes back with the entry', async () => {
    const user = userEvent.setup();
    renderAs('admin', 'ws-team');

    await user.click(await screen.findByRole('button', { name: 'Add Entry' }));
    await user.type(screen.getByRole('textbox', { name: /body/i }), 'Ask dana@example.com first.');
    await user.click(screen.getByRole('button', { name: 'Add Entry' }));

    expect(await screen.findByText(/scanner flagged possible personal data/i)).toBeInTheDocument();
    expect(screen.getByText(/body_md: email/)).toBeInTheDocument();
  });
});

describe('archived workspaces', () => {
  it('stops entry writes and says so, while leaving the metadata editable', async () => {
    renderAs('admin', 'ws-archived');

    await screen.findByText('Vendor grid evaluation');
    expect(screen.getByText(/Nothing more can be written in here/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Entry' })).not.toBeInTheDocument();
    // Renaming is not gated on archive state server-side — it cannot be, or an
    // archived workspace could never be un-archived.
    expect(screen.getByRole('button', { name: 'Edit Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Un-archive' })).toBeInTheDocument();
  });

  it('un-archives by sending an explicit null, not by omitting the field', async () => {
    const user = userEvent.setup();
    renderAs('admin', 'ws-archived');

    await user.click(await screen.findByRole('button', { name: 'Un-archive' }));
    expect(await screen.findByText(/Un-archived/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('gives a producer no write controls on the team’s workspace', async () => {
    renderAs('producer', 'ws-team');

    await screen.findByText('Digital Enablement decisions');
    expect(screen.queryByRole('button', { name: 'Add Entry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('gives a producer write controls on their own workspace', async () => {
    renderAs('producer', 'ws-personal');

    expect(await screen.findByRole('button', { name: 'Add Entry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
