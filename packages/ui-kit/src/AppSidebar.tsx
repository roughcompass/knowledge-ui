import { FlexLayout, NavigationItem, Text } from '@salt-ds/core';
import { ChevronLeftIcon } from '@salt-ds/icons';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import styles from './AppSidebar.module.css';

/**
 * The navigation rail: fixed zones around one panel that swaps as you drill in.
 *
 * Four regions, and only one of them scrolls:
 *
 *   header  — the scope switcher, always visible
 *   search  — optional, always visible
 *   panel   — the nav list, or a section's children once drilled in. Scrolls.
 *   footer  — the account row, pinned to the bottom
 *
 * Pinning the footer is what stops a long child list from pushing the account
 * menu off the viewport, which is the failure mode of putting the whole rail in
 * one scroll container.
 *
 * The width is user-resizable. Salt's `SidePanel` exposes a width variable but no
 * resize affordance, so the handle is composed here; the value is written to a
 * CSS custom property and persisted, so it survives a reload.
 */

const WIDTH_STORAGE_KEY = 'kui:sidebar-width';
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
/** Deepest the edge fade goes, so it hints at more without hiding a whole row. */
const FADE_MAX = 24;

function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
  } catch {
    // Private browsing and some embedded webviews throw on access rather than
    // returning null. A rail width is a convenience; losing it costs a default.
    return DEFAULT_WIDTH;
  }
}

export function AppSidebar({
  header,
  search,
  children,
  footer,
  label = 'Main',
}: {
  header: ReactNode;
  search?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);

  /*
   * Drives the edge fade. CSS cannot ask whether a list overflows, so the two mask
   * stops are written here from the scroll position: a fade appears only on an edge
   * that has content beyond it, and never on a list short enough to fit.
   */
  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const cap = (n: number) => `${Math.min(FADE_MAX, Math.max(0, n))}px`;
    el.style.setProperty('--fadeTop', cap(el.scrollTop));
    el.style.setProperty('--fadeBottom', cap(max - el.scrollTop));
  }, []);

  // Also on mount and on resize: whether the list overflows depends on the rail's
  // height, which a drag or a window resize changes without any scrolling.
  useEffect(() => {
    syncFade();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncFade, children]);

  // Read on mount rather than in the initialiser: this component renders during
  // SSR in the standalone harnesses, where `window` does not exist.
  useEffect(() => setWidth(readStoredWidth()), []);

  const commit = useCallback((next: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)));
    setWidth(clamped);
    try {
      window.localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      /* nothing to do — the width simply will not persist */
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = railRef.current?.getBoundingClientRect().width ?? width;

      const move = (e: PointerEvent) => commit(startWidth + (e.clientX - startX));
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [commit, width],
  );

  return (
    <div
      ref={railRef}
      className={styles.rail}
      // The one dynamic value in the component, and it has to be inline: a width
      // dragged by the reader cannot live in a stylesheet.
      style={{ '--sidebarWidth': `${width}px` } as React.CSSProperties}
    >
      <div className={`${styles.zone} ${styles.zoneDivided}`}>{header}</div>
      {search ? <div className={styles.zone}>{search}</div> : null}

      <nav ref={scrollRef} aria-label={label} className={styles.scroll} onScroll={syncFade}>
        {children}
      </nav>

      {footer ? <div className={styles.footerZone}>{footer}</div> : null}

      {/*
        A real button so it is focusable and operable from the keyboard. `separator`
        with an orientation and value is the role a resize handle should carry, and
        it is what lets a screen reader announce the current width.
      */}
      <button
        type="button"
        className={styles.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') commit(width - 16);
          if (event.key === 'ArrowRight') commit(width + 16);
          if (event.key === 'Home') commit(DEFAULT_WIDTH);
        }}
      />
    </div>
  );
}

/**
 * The drilled panel's header: a back control and the section's name.
 *
 * Replaces the top-level list rather than nesting beside it, which is what keeps
 * a deep tree from indenting into an unreadable column. The back control is a
 * link, not a button, so the parent level is a real destination that can be
 * opened in a new tab — the panel state follows the route rather than the reverse.
 */
export function SidebarBack({
  href,
  render,
  children,
}: {
  href: string;
  render: (props: Record<string, unknown>) => ReactElement;
  /** The name of the destination, e.g. `'Overview'` — not of the current section. */
  children: string;
}) {
  return (
    // NavigationItem rather than a Button: Salt's Button has no `render` prop, so
    // it cannot become a router link, and the parent level needs to be a real
    // destination. This also inherits the rail's own hover and focus treatment.
    <NavigationItem href={href} orientation="vertical" render={render}>
      <FlexLayout gap={1} align="center">
        <ChevronLeftIcon aria-hidden />
        {/*
          Shows "Overview", announces "Back to Overview". The chevron carries the
          direction visually and is hidden from assistive tech, so without this the
          control would be indistinguishable from a link *to* that destination.

          `children` names where this goes, not where it is. It previously named the
          section being drilled — announcing "Back to Operations" on a control whose
          href was `/`, which is the one thing a back control must not get wrong.
        */}
        <Text className="salt-visuallyHidden">Back to </Text>
        <Text styleAs="label">{children}</Text>
      </FlexLayout>
    </NavigationItem>
  );
}

