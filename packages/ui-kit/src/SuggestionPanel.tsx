import type { ReactNode } from 'react';

import styles from './SuggestionPanel.module.css';

/**
 * A field with a panel that floats beneath it.
 *
 * Exists so the global search can preview results without the shell growing a
 * stylesheet — this package is the only one allowed one, and a floating panel needs
 * `position` and `inset`, which are precisely what Salt's layout components decline
 * to express.
 *
 * Deliberately not a combo box. Salt ships one, and it owns its own list, selection
 * and filtering; here the field submits to a real URL and the panel offers links, so
 * a combo box would have to be fought to stop it behaving like a select.
 */
export function SuggestionField({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  return (
    <div className={styles.root}>
      {children}
      {panel ? <div className={styles.panel}>{panel}</div> : null}
    </div>
  );
}
