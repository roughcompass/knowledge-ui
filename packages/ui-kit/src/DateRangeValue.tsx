import { Overlay, OverlayPanel, OverlayPanelContent, OverlayTrigger, Text } from '@salt-ds/core';
import { useState } from 'react';

import { DateRangeControls } from './DateRangeControls';
import { formatDayRange } from './dateRange';
import type { DayRange, WindowSelection } from './dateRange';
import styles from './DateRangeValue.module.css';

/**
 * The window a panel is reporting, shown prominently and clickable to change it.
 *
 * ## Why it is a control rather than a caption
 *
 * The range used to be a clause at the end of each section's description —
 * "…, 2026-07-28 to 2026-08-03." — in secondary ink at body size, which is where a
 * reader's eye goes last. It is the single most load-bearing fact on any of these
 * panels: every number beside it is meaningless without it, and two readers quoting
 * figures from different windows is the failure this whole page is built to avoid.
 * So it reads as a value, not as punctuation.
 *
 * Making it clickable follows from that. Having noticed the window, the next thing a
 * reader wants is to change it, and sending them back to the top of the page to find
 * a dropdown is a trip with nothing in it. The overlay holds the same controls the
 * page's filter row holds, bound to the same state — so this is a second *place* to
 * reach one filter, never a second filter.
 *
 * ## What it deliberately does not do
 *
 * It does not hold its own window. Every instance renders the page's selection and
 * every instance changes it, which is what keeps two panels from reporting different
 * ranges — the state lives on the page for the same reason the filter does.
 *
 * It also never shows the range it *asked* for. The `range` passed in should be the
 * one a response reported back, so a narrowed window shows as narrowed here rather
 * than as the request that was not honoured.
 */
export function DateRangeValue({
  range,
  selection,
  onSelectionChange,
}: {
  /** The window a response actually covered, not the one requested. */
  range: DayRange;
  selection: WindowSelection;
  onSelectionChange: (next: WindowSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = formatDayRange(range);

  return (
    <Overlay open={open} onOpenChange={setOpen} placement="bottom">
      <OverlayTrigger>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`Window: ${label}. Change it.`}
        >
          <Text styleAs="label" as="span" className={styles.value}>
            {label}
          </Text>
        </button>
      </OverlayTrigger>
      <OverlayPanel className={styles.panel}>
        <OverlayPanelContent>
          <DateRangeControls value={selection} onChange={onSelectionChange} layout="stack" />
        </OverlayPanelContent>
      </OverlayPanel>
    </Overlay>
  );
}
