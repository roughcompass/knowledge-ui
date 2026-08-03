import type { ReactNode } from 'react';

import styles from './AppShell.module.css';

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
}: {
  rail: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.railSlot}>{rail}</div>
      <div className={styles.column}>
        {/*
          A `header` element, so the bar is the page's banner landmark without the
          caller having to supply one. It used to pass its own `as="header"` along
          with the bar's padding and bottom rule, which meant the caller decided
          the bar's height — and got it wrong, by 13px against the rail's header.
        */}
        {topBar ? <header className={styles.topBar}>{topBar}</header> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
