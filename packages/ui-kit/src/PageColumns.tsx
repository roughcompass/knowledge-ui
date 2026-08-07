import { GridItem, GridLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A main column with an aside.
 *
 * Every page in this app was a vertical stack of full-width cards inside a 1200px
 * cap, and `TileGrid` was the only multi-column arrangement anywhere. On a wide
 * display that leaves the rail, twelve hundred pixels of content, and a large empty
 * remainder — most of what made the console read as sparse next to its reference. The
 * cap was right for prose and for a page of one table. It was never right for a page
 * that has an identity block, a subscription control and a set of related links
 * standing beside its main content, all of which had to queue below it instead.
 *
 * Salt ships `GridLayout` and `GridItem` and neither was used. This is them, named
 * for the one arrangement worth having, so a page does not re-derive a grid each time
 * and end up with four slightly different ones.
 *
 * Two rules it enforces rather than documents:
 *
 * **DOM order is reading order.** `main` renders before `aside` in the markup and the
 * grid places them; nothing uses `order`, which would leave a keyboard or screen
 * reader traversing the page in a sequence the eye does not see.
 *
 * **It collapses to one column, main first.** Below the medium breakpoint the aside
 * follows the content it annotates rather than preceding it. That is why the aside is
 * for supporting material and not for anything a reader needs before the main column
 * makes sense.
 */
export function PageColumns({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <GridLayout columns={{ xs: 1, md: 3 }} gap={3}>
      <GridItem colSpan={{ xs: 1, md: 2 }}>{main}</GridItem>
      <GridItem colSpan={1}>{aside}</GridItem>
    </GridLayout>
  );
}
