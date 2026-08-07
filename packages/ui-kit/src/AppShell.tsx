import { Button } from '@salt-ds/core';
import { CloseIcon, MicroMenuIcon } from '@salt-ds/icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import styles from './AppShell.module.css';

const NARROW_VIEWPORT_QUERY = '(max-width: 48rem)';

function narrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(NARROW_VIEWPORT_QUERY).matches;
}

/**
 * The application frame: a full-height rail, then a column holding the top bar
 * and the scrolling content.
 *
 * Replaces `BorderLayout` for the shell, which could not produce this shape — see
 * the stylesheet for why. The rail is full height and the top bar sits beside it
 * rather than above it, so the bar's breadcrumb starts where the content starts.
 *
 * Only the content region scrolls. That is deliberate: the alternative is a
 * document-level scroll with `position: sticky` chrome, which is what made page
 * titles slide under the header before.
 */
export function AppShell({
  rail,
  topBar,
  children,
  navigationLabel = 'Navigation',
}: {
  rail: ReactNode;
  topBar?: ReactNode;
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
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNavigation();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeNavigation, isNarrow, navigationOpen]);

  return (
    <div className={styles.shell}>
      {/*
        eslint-disable-next-line jsx-a11y/click-events-have-key-events --
        This is delegated link handling, not a clickable div: native links emit a
        click for keyboard activation, and adding a parent key handler would close
        the dialog before the link performs its navigation.
      */}
      <div
        id="app-navigation"
        className={`${styles.railSlot} ${navigationOpen ? styles.railOpen : ''}`}
        role={isNarrow && navigationOpen ? 'dialog' : undefined}
        aria-modal={isNarrow && navigationOpen ? true : undefined}
        aria-label={isNarrow && navigationOpen ? navigationLabel : undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a[href]')) closeNavigation();
        }}
      >
        {rail}
        <Button
          ref={closeButtonRef}
          className={styles.mobileCloseButton}
          appearance="transparent"
          sentiment="neutral"
          aria-label="Close navigation"
          onClick={closeNavigation}
        >
          <CloseIcon aria-hidden />
        </Button>
      </div>
      <div className={styles.column} {...(isNarrow && navigationOpen ? { inert: '' } : {})}>
        {/*
          A `header` element, so the bar is the page's banner landmark without the
          caller having to supply one. It used to pass its own `as="header"` along
          with the bar's padding and bottom rule, which meant the caller decided
          the bar's height — and got it wrong, by 13px against the rail's header.
        */}
        {topBar ? (
          <header className={styles.topBar}>
            <Button
              ref={openButtonRef}
              className={styles.mobileNavigationButton}
              appearance="transparent"
              sentiment="neutral"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              aria-expanded={navigationOpen}
              aria-controls="app-navigation"
              onClick={() => setNavigationOpen(true)}
            >
              <MicroMenuIcon aria-hidden />
            </Button>
            <div className={styles.topBarContent}>{topBar}</div>
          </header>
        ) : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
