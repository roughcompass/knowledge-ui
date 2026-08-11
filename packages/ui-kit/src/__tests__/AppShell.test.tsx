import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../AppShell';

function installNarrowViewport() {
  const media = {
    matches: true,
    media: '(max-width: 64rem)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } satisfies MediaQueryList;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AppShell narrow navigation', () => {
  it('opens as a labeled dialog, closes after navigation, and returns focus', async () => {
    installNarrowViewport();
    const user = userEvent.setup();

    render(
      <AppShell
        navigationLabel="Catalog navigation"
        topBar={<span>Catalog</span>}
        rail={<a href="#catalog">Capabilities</a>}
      >
        <span>Page content</span>
      </AppShell>,
    );

    const open = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(open);

    const dialog = screen.getByRole('dialog', { name: 'Catalog navigation' });
    expect(dialog).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('link', { name: 'Capabilities' }));
    fireEvent.animationEnd(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });

  it('closes with Escape', async () => {
    installNarrowViewport();
    const user = userEvent.setup();

    render(
      <AppShell topBar={<span>Catalog</span>} rail={<span>Navigation</span>}>
        <span>Page content</span>
      </AppShell>,
    );

    const open = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    await user.keyboard('{Escape}');

    fireEvent.animationEnd(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });
});
