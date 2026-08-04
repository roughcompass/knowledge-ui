import { GridLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A row of peer tiles or cards, all the same width.
 *
 * Three surfaces laid these out with `FlowLayout`, which sizes every child to its
 * own content. That is right for chips and wrong for peers: on the operational
 * health page four queue tiles rendered as three at 262px and one at 775px, because
 * the fourth was the one with a non-zero count and therefore the one carrying a
 * sentence explaining the consequence. The tile that mattered most was the one that
 * looked like a mistake.
 *
 * A grid decides the width from the column count instead, so a long hint wraps
 * inside its tile rather than stretching it, and a row of peers reads as a row.
 *
 * The ramp lives here rather than at the three call sites so they cannot disagree
 * about it — which is the whole reason a shared kit exists. One column on a narrow
 * viewport, two from small up, and `columns` for the widest: three for metric tiles,
 * two for a pair of destinations where thirds would leave a visible hole.
 */
export function TileGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  /** Widest-viewport column count. Two for cards, three for tiles. */
  columns?: 2 | 3;
}) {
  return (
    <GridLayout gap={2} columns={{ xs: 1, sm: 2, md: columns }}>
      {children}
    </GridLayout>
  );
}
