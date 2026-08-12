import {
  BorderItem,
  BorderLayout,
  Button,
  Divider,
  Drawer,
  DrawerCloseButton,
  FlexLayout,
  Panel,
  StackLayout,
  Toolbar,
  Tooltray,
} from '@salt-ds/core';
import { CloseIcon, MenuIcon } from '@salt-ds/icons';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const NARROW_VIEWPORT_QUERY = '(max-width: 47.9375rem)';
const VIEWPORT_EDGE_MARGIN = 'calc(var(--salt-spacing-100) * -2 / 3)';
const CONTENT_PANEL_STYLE = {
  '--saltPanel-borderRadius': '0',
  '--saltPanel-padding': '0',
} as CSSProperties;

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
  topBarStart,
  topBarEnd,
  footer,
  children,
  navigationLabel = 'Navigation',
}: {
  rail: ReactNode;
  topBarStart?: ReactNode;
  topBarEnd?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Names the full-screen navigation dialog used on narrow viewports. */
  navigationLabel?: string;
}) {
  const [isNarrow, setIsNarrow] = useState(narrowViewport);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );

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

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const measure = () => {
      setHeaderHeight(header.getBoundingClientRect().height);
      setViewportHeight(window.innerHeight);
    };
    measure();

    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const railViewportStyle =
    headerHeight > 0
      ? ({
          top: `${headerHeight}px`,
          height: `${Math.max(0, viewportHeight - headerHeight)}px`,
        } as CSSProperties)
      : undefined;

  const headerPanelStyle = {
    '--saltPanel-borderRadius': '0',
    '--saltPanel-padding': `${
      isNarrow ? 'var(--salt-spacing-50)' : 'calc(var(--salt-size-fixed-700) / 2)'
    } ${isNarrow ? 'var(--salt-spacing-100)' : 'var(--salt-spacing-200)'}`,
  } as CSSProperties;

  const footerPanelStyle = {
    '--saltPanel-borderRadius': '0',
    '--saltPanel-padding': isNarrow ? 'var(--salt-spacing-100)' : 'var(--salt-spacing-200)',
  } as CSSProperties;

  return (
    <BorderLayout margin={VIEWPORT_EDGE_MARGIN}>
      {topBarStart !== undefined || topBarEnd !== undefined ? (
        <BorderItem ref={headerRef} as="header" position="north" sticky>
          <Panel variant="primary" style={headerPanelStyle}>
            <Toolbar appearance="transparent" variant="primary">
              <Tooltray align="start" overflowMode="none">
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
                {topBarStart}
              </Tooltray>
              {topBarEnd !== undefined ? (
                <Tooltray align="end" overflowMode="none">
                  {topBarEnd}
                </Tooltray>
              ) : null}
            </Toolbar>
          </Panel>
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
            <BorderItem position="west" sticky style={railViewportStyle}>
              {rail}
            </BorderItem>
          )}

          <BorderItem position="center">
            <BorderLayout>
              <BorderItem position="center">
                <Panel variant="secondary" style={CONTENT_PANEL_STYLE}>
                  {children}
                </Panel>
              </BorderItem>
              {footer ? (
                <BorderItem as="footer" position="south">
                  <StackLayout gap={0}>
                    <Divider variant="tertiary" />
                    <Panel variant="secondary" style={footerPanelStyle}>
                      {footer}
                    </Panel>
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
