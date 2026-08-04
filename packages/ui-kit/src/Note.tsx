import { StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import styles from './Note.module.css';

/**
 * Inline contextual feedback, beside the thing it describes.
 *
 * ## When this and not one of the two neighbours
 *
 * There are now three ways to tell a reader something, and the difference between
 * them is the reason this is documented at length rather than just added. Reaching
 * for the wrong one is how a console acquires a second idiom for the same job.
 *
 * - **`Note`** — a caveat, a consequence, or a passed check *about the panel it sits
 *   in*. It qualifies data the reader is looking at.
 * - **`UnavailableNotice`** — the data does not exist to fetch. A banner, because it
 *   is a statement about the surface rather than about a value on it.
 * - **`EmptyState`** — the query ran and found nothing. It will fill when data
 *   arrives; the other two will not.
 *
 * ## Persistent, by construction
 *
 * There is no dismiss prop and there will not be one. A note stays until the state
 * it describes changes, and a dismiss control competes with the message — the reader
 * closes it to clear the screen and the caveat is gone while the caveat still
 * applies. Where a caveat is uniform across every row of something, it belongs here
 * once rather than on each row, because an identical marker repeated becomes chrome
 * the eye stops seeing.
 *
 * ## One action, at most
 *
 * `action` is a single slot rather than children. Two buttons in a note make it a
 * decision point, and a note is not where a decision belongs — that is a dialog or
 * a form. One inline route onward is the most it should offer.
 *
 * ## Copy
 *
 * `label` is one or two words in Title Case naming the topic — "Cached Result",
 * "Retention Limit" — and `children` is one active-voice sentence about the
 * consequence. Neither is enforceable, and both are the difference between a note
 * that gets read and one that gets skipped. No "Heads up", no "FYI": a note that
 * opens by announcing that it is a note has spent its first line saying nothing.
 */
export function Note({
  label,
  variant = 'neutral',
  action,
  children,
}: {
  /** One or two words, Title Case, naming the topic rather than the feeling. */
  label: string;
  /**
   * Chosen by meaning, never by colour:
   *
   * - `error` — a problem the reader must fix.
   * - `warning` — a consequence to acknowledge. Most data caveats are this.
   * - `success` — a check that passed, worth confirming.
   * - `neutral` — context that is neither good nor bad. The default, and the right
   *   choice for "here is what this number does not say".
   */
  variant?: 'neutral' | 'success' | 'warning' | 'error';
  /** A single route onward. Deliberately not a list. */
  action?: ReactNode;
  /** One active-voice sentence about the consequence. */
  children: ReactNode;
}) {
  return (
    <div className={`${styles.note} ${styles[variant]}`} role="note">
      <StackLayout gap={0.5}>
        <Text styleAs="label" className={styles.label}>
          {label}
        </Text>
        <Text>{children}</Text>
        {action !== undefined ? <div className={styles.action}>{action}</div> : null}
      </StackLayout>
    </div>
  );
}
