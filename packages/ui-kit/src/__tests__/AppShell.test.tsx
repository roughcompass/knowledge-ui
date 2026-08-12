import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../AppShell';
import { AppSidebar } from '../AppSidebar';

function installNarrowViewport() {
  const media = {
    matches: true,
    media: '(max-width: 47.9375rem)',
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
        topBarStart={<span>Catalog</span>}
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
      <AppShell topBarStart={<span>Catalog</span>} rail={<span>Navigation</span>}>
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

describe('AppShell desktop frame', () => {
  it('keeps the header above the rail and content, exposes the footer, and applies rail width', () => {
    render(
      <AppShell
        topBarStart={<span>Product toolbar</span>}
        rail={<span>Desktop navigation</span>}
        footer={<span>Product footer</span>}
      >
        <span>Page content</span>
      </AppShell>,
    );

    const banner = screen.getByRole('banner');
    const navigation = screen.getByText('Desktop navigation');
    const railItem = navigation.parentElement;

    expect(banner.className).toMatch(/sticky/);
    expect(banner.parentElement).toBe(railItem?.parentElement?.parentElement?.parentElement);
    expect(banner.querySelector('.saltPanel')?.getAttribute('style')).toContain(
      '--saltPanel-borderRadius: 0',
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Product footer');
  });

  it('applies the dynamic width and keeps only the menu body scrollable', () => {
    render(
      <AppSidebar
        header={<span>Workspace</span>}
        footer={<span>Session controls</span>}
        width={304}
      >
        <span>Navigation items</span>
      </AppSidebar>,
    );

    const navigation = screen.getByRole('navigation');
    const sidePanel = navigation.closest<HTMLElement>('.saltSidePanel');
    const menuBody = navigation.closest<HTMLElement>('.saltSidePanelContent-body');
    expect(sidePanel?.style.getPropertyValue('--saltSidePanel-width')).toBe('304px');
    expect(sidePanel?.style.getPropertyValue('--saltSidePanel-padding')).toContain(
      'calc(var(--salt-spacing-100) * 4 / 3)',
    );
    expect(menuBody).toContainElement(navigation);
    expect(menuBody).not.toContainElement(screen.getByText('Workspace'));
    expect(menuBody).not.toContainElement(screen.getByText('Session controls'));
  });

  it('uses the reference 72px icon-rail in compact mode', () => {
    render(
      <AppSidebar compact width={72}>
        <span>Compact navigation</span>
      </AppSidebar>,
    );

    const sidePanel = screen.getByRole('navigation').closest<HTMLElement>('.saltSidePanel');
    expect(sidePanel?.style.getPropertyValue('--saltSidePanel-width')).toBe('72px');
    expect(sidePanel?.style.getPropertyValue('--saltSidePanel-padding')).toContain(
      'calc(var(--salt-spacing-100) * 2 / 3)',
    );
  });
});
