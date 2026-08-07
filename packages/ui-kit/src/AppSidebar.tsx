import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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
    (event: React.PointerEvent<HTMLDivElement>) => {
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
        A focusable separator — the window-splitter pattern. `separator` carrying an
        orientation and a value is the role a resize handle should have, and adding
        `tabindex` is what promotes it from decoration to a widget, so a screen
        reader announces the current width and the arrow keys work.

        This was a `<button>` first, for the focusability that comes free with one.
        That is not a legal pairing: the roles a `<button>` may take are an
        enumerated list and `separator` is not on it, so the element and the role
        described two different things and a browser was free to believe either. A
        `div` starts with no semantics to contradict, which is what makes the role
        the whole answer here — and it needs no `background`/`border`/`padding`
        reset, so the stylesheet lost three declarations undoing button chrome.
      */}
      {/*
        eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
        The plugin classes `separator` as non-interactive from the ARIA role table,
        which is right for the default case and wrong for this one: ARIA defines a
        separator *with* `tabindex` as a widget, and a splitter that cannot be
        driven from the keyboard is the thing the rule is trying to prevent. There
        is no role that would satisfy both the plugin and a screen reader here, so
        the exception is scoped to this element and the reason recorded rather than
        the rule weakened repo-wide.
      */}
      <div
        className={styles.handle}
        tabIndex={0}
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
