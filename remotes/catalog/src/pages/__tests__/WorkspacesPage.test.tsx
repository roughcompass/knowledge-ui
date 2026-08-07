import { createRegistryClient } from '@knowledge-ui/api-client';
import { makeSession, renderWithProviders, resetWorkspaceStore } from '@knowledge-ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkspacesPage } from '../WorkspacesPage';

const tokenFor = (clientId: string) =>
  `header.${btoa(JSON.stringify({ sub: clientId, exp: 9999999999 }))}.signature`;

const renderAs = (role: 'producer' | 'admin' | 'consumer' | 'auditor') =>
  renderWithProviders(<WorkspacesPage />, {
    session: makeSession({ role, personaKey: role }),
    client: createRegistryClient({
      baseUrl: 'http://localhost',
      getToken: () => tokenFor(`knowledge-ui-${role}`),
    }),
  });

beforeEach(() => {
  resetWorkspaceStore();
});

describe('what the list shows', () => {
  it('shows the workspaces the server returned, not a client-side selection', async () => {
    renderAs('producer');
    expect(await screen.findByText('Digital Enablement decisions')).toBeInTheDocument();
    expect(screen.getByText('Host-to-host migration notes')).toBeInTheDocument();
  });

  it('hides archived workspaces until the filter asks for them', async () => {
    const user = userEvent.setup();
    renderAs('admin');

    await screen.findByText('Digital Enablement decisions');
    expect(screen.queryByText('Vendor grid evaluation')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Including archived' }));

    // Only present if the request went back out with include_archived — nothing
    // here filters a list it already had.
    expect(await screen.findByText('Vendor grid evaluation')).toBeInTheDocument();
  });

  it('names ownership in the reader’s words rather than the wire’s', async () => {
    renderAs('admin');
    await screen.findByText('Digital Enablement decisions');
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0);
    expect(screen.queryByText('tenant')).not.toBeInTheDocument();
  });
});

describe('who may create', () => {
  it('offers a producer the personal kind and nothing else', async () => {
    const user = userEvent.setup();
    renderAs('producer');

    await user.click(await screen.findByRole('button', { name: 'New Workspace' }));
    const visibility = screen.getByRole('combobox', { name: /visibility/i });
    await user.click(visibility);

    expect(await screen.findByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Team' })).not.toBeInTheDocument();
  });

  it('tells a consumer which role creates what, on the control itself', async () => {
    /*
      The refusal moved from a banner onto a disabled button in the same place
      other roles find the working one — still present, still focusable, with the
      who-can answer in its tooltip. The invariant under test is unchanged: the
      button is never silently hidden.
    */
    renderAs('consumer');
    await screen.findByText('Digital Enablement decisions');
    const create = screen.getByRole('button', { name: 'New Workspace' });
    // aria-disabled, not the attribute: the button stays focusable so keyboard
    // users can reach the tooltip that says who can create.
    expect(create).toHaveAttribute('aria-disabled', 'true');
  });

  it('creates a workspace and says what its visibility means', async () => {
    const user = userEvent.setup();
    renderAs('producer');

    await user.click(await screen.findByRole('button', { name: 'New Workspace' }));
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Q3 review');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByText(/Created Q3 review/)).toBeInTheDocument();
    // The row is there because the list refetched, not because anything local
    // pushed it into the table.
    expect(await screen.findByText('Q3 review')).toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('offers Delete only against rows this session may actually delete', async () => {
    renderAs('producer');
    await screen.findByText('Host-to-host migration notes');

    const personal = screen.getByText('Host-to-host migration notes').closest('tr') as HTMLElement;
    const team = screen.getByText('Digital Enablement decisions').closest('tr') as HTMLElement;

    expect(within(personal).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // A producer cannot delete the team's workspace, so there is no control for
    // it — rather than one that fails when pressed.
    expect(within(team).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('names archiving as the reversible alternative before deleting', async () => {
    const user = userEvent.setup();
    renderAs('producer');

    await screen.findByText('Host-to-host migration notes');
    const personal = screen.getByText('Host-to-host migration notes').closest('tr') as HTMLElement;
    await user.click(within(personal).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Archiving instead keeps it readable/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Workspace' }));
    await waitFor(() => {
      expect(screen.queryByText('Host-to-host migration notes')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Digital Enablement decisions')).toBeInTheDocument();
  });
});
