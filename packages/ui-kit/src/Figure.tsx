import { StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { DataTable, type Column } from './DataTable';
import styles from './Figure.module.css';

/**
 * A chart and the table it was drawn from, as one thing.
 *
 * The pairing is the component's entire reason to exist, so it is expressed in
 * the type rather than in a convention: `rows` and `columns` are required and
 * there is no prop that suppresses the table. A caller cannot render the mark
 * alone, which is what makes this a constraint rather than a suggestion.
 *
 * **Why a visible table and not alt text.** A hidden description serves a screen
 * reader and nobody else. The reader who needs an exact figure, the one checking
 * a number before quoting it, and the one whose chart failed to paint are all
 * served by the same visible rows — and unlike alt text, a table cannot drift
 * out of sync with the data because it *is* the data. This follows the precedent
 * the sibling frontend set with its blast-radius diagram.
 *
 * **Why the mark is `aria-hidden`.** With the table present, announcing the
 * SVG's contents would read the same values twice, and the second reading has no
 * structure. The mark is decoration in the accessibility tree precisely because
 * the information is guaranteed to be somewhere better.
 */
export function Figure<TRow>({
  caption,
  description,
  mark,
  rows,
  columns,
  getRowId,
  isLoading = false,
}: {
  /** Names the figure. Used as the table's caption, so it is never decorative. */
  caption: string;
  description?: ReactNode;
  /**
   * The visual. Receives nothing: a mark that needed props the table did not
   * have would be drawing something the table cannot corroborate.
   */
  mark: ReactNode;
  rows: readonly TRow[];
  columns: ReadonlyArray<Column<TRow>>;
  getRowId: (row: TRow) => string;
  /**
   * Render the figure's own placeholder instead of a spinner beside it.
   *
   * The mark's box is reserved at its real height and the table draws its
   * column-derived rows, so the panel does not resize when the data lands. A
   * spinner here collapsed the whole figure to a single line and then pushed the
   * page down by the height of a chart and five rows.
   */
  isLoading?: boolean;
}) {
  return (
    <StackLayout gap={2}>
      {description !== undefined ? <Text color="secondary">{description}</Text> : null}

      {/*
        Hidden from assistive technology, not from the layout. The table below
        carries the same values in a form that can be navigated.

        While loading the box is still here and still empty, which is the point:
        it holds the space the chart will occupy. The mark is not rendered, because
        a mark drawn from no data is a chart asserting a shape nobody measured.
      */}
      <div
        className={isLoading ? `${styles.mark} ${styles.markReserved}` : styles.mark}
        aria-hidden="true"
      >
        {isLoading ? null : mark}
      </div>

      <DataTable
        caption={caption}
        columns={columns}
        rows={rows}
        getRowId={getRowId}
        isLoading={isLoading}
      />
    </StackLayout>
  );
}
