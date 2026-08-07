import { makeSession, renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SessionDebugPage } from '../SessionDebugPage';

describe('the session page', () => {
  it('offers no copy control on an absent value', () => {
    const session = makeSession({ actorEmail: null });
    renderWithProviders(<SessionDebugPage session={session} />, { session });

    // The dash marks the absence; a button beside it would copy the dash.
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy Email' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Actor' })).toBeInTheDocument();
  });

  it('folds Persona into Role when the two carry the same word', () => {
    const session = makeSession({ role: 'admin', personaKey: 'admin' });
    renderWithProviders(<SessionDebugPage session={session} />, { session });

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.queryByText('Persona')).not.toBeInTheDocument();
  });

  it('splits them again the moment they differ', () => {
    const session = makeSession({ role: 'consumer', personaKey: 'tenant-consumer' });
    renderWithProviders(<SessionDebugPage session={session} />, { session });

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('consumer')).toBeInTheDocument();
    expect(screen.getByText('Persona')).toBeInTheDocument();
    expect(screen.getByText('tenant-consumer')).toBeInTheDocument();
  });

  it('describes itself in the reader’s words', () => {
    const session = makeSession({});
    renderWithProviders(<SessionDebugPage session={session} />, { session });

    expect(screen.getByText('What the server currently knows about you.')).toBeInTheDocument();
    expect(screen.queryByText(/not from local state/)).not.toBeInTheDocument();
  });
});
