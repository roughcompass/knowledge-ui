import { FlexItem, FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { SkeletonBar } from './Skeleton';

export interface Description {
  /** The field name, as the reader would say it. */
  term: string;
  detail: ReactNode;
}

/**
 * A block of metadata: names and their values.
 *
 * ## Why not a two-column table, which is what this replaces
 *
 * A table says its rows are *comparable* — same shape, and at least one column you
 * would sort or scan down. That is a real claim and it is false for metadata. A
 * capability's attributes are one heterogeneous set of fields about one thing; there
 * is nothing to compare a lifecycle state against, and offering column headers
 * called "Key" and "Value" invites a reader to scan a column that means nothing as a
 * column.
 *
 * It also costs accessibility rather than buying it. A screen reader announces a
 * table's dimensions and navigates it as a grid, so a reader arrives expecting
 * structure that is not there.
 *
 * The rule this follows: tabular data goes in a table, a single descriptive row with
 * an action goes in an entity row, and a block of metadata goes here.
 *
 * ## Built from Salt's layout components, with no markup or stylesheet of its own
 *
 * The first version used raw `dl`/`dt`/`dd` with a CSS grid. Semantic markup is a
 * real argument, and it lost to a simpler one: this repo composes from the design
 * system by default, and a bespoke stylesheet for a two-column block is a layout
 * Salt's own primitives already do. `FlexLayout` with a fixed-basis first column
 * gives the same alignment, wraps the same way on a narrow viewport, and inherits
 * the spacing scale rather than restating it.
 *
 * What is kept from that version is the labelled region, so the block still says
 * what it describes — a set of name/value pairs with no statement of their subject
 * is a puzzle.
 *
 * ## Values of unknown shape
 *
 * `detail` is a node, not a string, because callers legitimately have objects. The
 * server returns bitemporal attributes as objects — a lifecycle arrives as
 * `{ state: 'beta' }` — and `String()` on that renders the literal text
 * `[object Object]`, which shipped once and was caught only by running against a
 * real contextplane rather than a fixture of strings. Rendering stays the caller's
 * decision, so it can be right about its own data.
 */
export function DescriptionList({
  caption,
  items,
  hideCaption = false,
  isLoading = false,
}: {
  /** Names the block, and labels the region for assistive technology. */
  caption: string;
  items: readonly Description[];
  /** Hide the caption visually where a card header already carries it. */
  hideCaption?: boolean;
  /**
   * Draw a bar in place of each detail, keeping every term.
   *
   * The terms are the caller's own `items`, so the placeholder has exactly the
   * rows the real block will have and cannot describe a different shape. Keeping
   * the terms visible also means the block says what it is about to tell you,
   * which a spinner cannot.
   */
  isLoading?: boolean;
}) {
  return (
    <StackLayout gap={1} aria-label={caption} role="group">
      {hideCaption ? null : <Text styleAs="label">{caption}</Text>}

      {items.map((item, index) => (
        /*
         * Wraps on a narrow viewport rather than compressing the value: a long
         * identifier squeezed into a sliver of column is less readable than the same
         * identifier on its own line.
         */
        <FlexLayout key={item.term} gap={2} align="start" wrap>
          <FlexItem basis="12rem" grow={0} shrink={0}>
            <Text styleAs="label" color="secondary">
              {item.term}
            </Text>
          </FlexItem>
          <FlexItem grow={1}>{isLoading ? <SkeletonBar index={index} /> : item.detail}</FlexItem>
        </FlexLayout>
      ))}
    </StackLayout>
  );
}
