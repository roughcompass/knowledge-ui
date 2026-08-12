import { GridItem, GridLayout, StackLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * The two width constraints the app needs, expressed through Salt's responsive
 * grid rather than application markup or CSS.
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
export function ContentColumn({
  children,
  width = 'standard',
}: {
  children: ReactNode;
  /**
   * `standard` (1200px) for a single column of tables and prose. `wide` (1600px) for
   * a page composed of two columns. `full` for a surface whose own content sets the
   * width. Chosen by what the page holds, not by how much.
   */
  width?: 'standard' | 'wide' | 'full';
}) {
  if (width === 'full') {
    return (
      <GridLayout columns="minmax(0, 1fr)" columnGap={0}>
        <GridItem>
          <StackLayout gap={3}>{children}</StackLayout>
        </GridItem>
      </GridLayout>
    );
  }

  const centerTrack = width === 'wide' ? '1600px' : '1200px';
  return (
    <GridLayout
      columns={`minmax(0, 1fr) minmax(min(100%, ${centerTrack}), ${centerTrack}) minmax(0, 1fr)`}
      columnGap={0}
    >
      <GridItem aria-hidden />
      <GridItem>
        <StackLayout gap={3}>{children}</StackLayout>
      </GridItem>
    </GridLayout>
  );
}

/**
 * Constrains a block of running text to a readable measure.
 *
 * For explanatory copy only. Applying it to a table or a form would shrink
 * controls that legitimately want the full column.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <GridLayout columns={{ xs: 1, md: 3 }}>
      <GridItem colSpan={{ xs: 1, md: 2 }}>
        <StackLayout gap={2}>{children}</StackLayout>
      </GridItem>
    </GridLayout>
  );
}
