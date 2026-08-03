import type { ReactNode } from 'react';

import styles from './Layout.module.css';

/**
 * The two width constraints the app needs, as components rather than classes.
 *
 * They live here because `packages/ui-kit` is the only workspace allowed a
 * stylesheet — the rule that keeps one-off CSS from spreading — so a page that
 * needs a measure asks for `<Prose>` instead of growing its own module.
 */

/**
 * Caps and centres the page content column.
 *
 * Without it every page is full-bleed, which on a wide monitor leaves prose
 * running the entire width and tables floating in a very long line of empty
 * space to the right.
 */
export function ContentColumn({ children }: { children: ReactNode }) {
  return <div className={styles.content}>{children}</div>;
}

/**
 * Constrains a block of running text to a readable measure.
 *
 * For explanatory copy only. Applying it to a table or a form would shrink
 * controls that legitimately want the full column.
 */
export function Prose({ children }: { children: ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}
