import {
  BorderItem,
  BorderLayout,
  Button,
  Divider,
  Drawer,
  DrawerCloseButton,
  FlexItem,
  FlexLayout,
  Panel,
  StackLayout,
} from '@salt-ds/core';
import { CloseIcon, MenuIcon } from '@salt-ds/icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const NARROW_VIEWPORT_QUERY = '(max-width: 64rem)';

function narrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(NARROW_VIEWPORT_QUERY).matches;
}

/**
 * The application frame, composed entirely from Salt's responsive layout and
 * drawer primitives. The design system owns spacing, surfaces, focus management,
 * breakpoints and mobile navigation behavior.
 */
export function AppShell({
  rail,
  topBar,
  footer,
  children,
  navigationLabel = 'Navigation',
}: {
  rail: ReactNode;
  topBar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Names the full-screen navigation dialog used on narrow viewports. */
  navigationLabel?: string;
}) {
  const [isNarrow, setIsNarrow] = useState(narrowViewport);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const sync = () => {
      setIsNarrow(media.matches);
      if (!media.matches) setNavigationOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isNarrow || !navigationOpen) return;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNavigation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closeNavigation, isNarrow, navigationOpen]);

  return (
    <BorderLayout>
      {topBar ? (
        <BorderItem as="header" position="north" sticky>
          <StackLayout gap={0}>
            <FlexLayout align="center" gap={2} padding={2}>
              {isNarrow ? (
                <Button
                  ref={openButtonRef}
                  appearance="transparent"
                  sentiment="neutral"
                  aria-label="Open navigation"
                  aria-haspopup="dialog"
                  aria-expanded={navigationOpen}
                  aria-controls="app-navigation"
                  onClick={() => setNavigationOpen(true)}
                >
                  <MenuIcon aria-hidden />
                </Button>
              ) : null}
              <FlexItem grow={1}>{topBar}</FlexItem>
            </FlexLayout>
            <Divider variant="tertiary" />
          </StackLayout>
        </BorderItem>
      ) : null}

      <BorderItem position="center">
        <BorderLayout>
          {isNarrow ? (
            <Drawer
              id="app-navigation"
              open={navigationOpen}
              onOpenChange={(open) => {
                if (open) setNavigationOpen(true);
                else closeNavigation();
              }}
              position="left"
              variant="secondary"
              aria-label={navigationLabel}
              initialFocus={closeButtonRef}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a[href]')) closeNavigation();
              }}
            >
              <FlexLayout padding={2} gap={2} direction="column">
                <DrawerCloseButton
                  ref={closeButtonRef}
                  appearance="transparent"
                  sentiment="neutral"
                  aria-label="Close navigation"
                  onClick={closeNavigation}
                >
                  <CloseIcon aria-hidden />
                </DrawerCloseButton>
                {rail}
              </FlexLayout>
            </Drawer>
          ) : (
            <BorderItem position="west" sticky>
              {rail}
            </BorderItem>
          )}

          <BorderItem position="center">
            <BorderLayout>
              <BorderItem position="center">
                <Panel variant="secondary">{children}</Panel>
              </BorderItem>
              {footer ? (
                <BorderItem as="footer" position="south">
                  <StackLayout gap={0}>
                    <Divider variant="tertiary" />
                    <Panel variant="secondary">{footer}</Panel>
                  </StackLayout>
                </BorderItem>
              ) : null}
            </BorderLayout>
          </BorderItem>
        </BorderLayout>
      </BorderItem>
    </BorderLayout>
  );
}
