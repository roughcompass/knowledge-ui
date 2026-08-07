import { TBody, TD, TH, THead, TR, Table, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { SectionCard } from './SectionCard';
import styles from './DataTable.module.css';
import { EmptyState } from './EmptyState';
import { displayText } from './displayText';
import { SkeletonBar } from './Skeleton';
import { KLink } from './LinkAdapter';

/**
 * A thin generic wrapper over Salt's table primitives.
 *
 * Thin on purpose. It exists to stop every screen re-deriving the same
 * header/body/empty/loading branches — not to become a grid framework. Sorting,
 * selection and virtualisation are absent because nothing here needs them yet,
 * and a data grid grown speculatively is the component nobody can change later.
 */

export interface Column<TRow> {
  key: string;
  header: ReactNode;
  /** Rendered content. Defaults to the row's value at `key`, stringified. */
  render?: (row: TRow) => ReactNode;
  /**
   * `right` also switches the column to tabular figures, because for a *count* the
   * two want each other: right alignment is what makes a column of totals scannable,
   * and proportional digits undo it by giving each row a different width.
   *
   * Two rounds of this were wrong, and the second is the more interesting failure.
   * It was first declared and never read, so every numeric column in the app —
   * scores, counts, totals — rendered left-aligned with proportional digits. Wiring
   * it to a CSS module class fixed the reading and not the rendering: Salt's own rule
   * is `table.saltTable td`, which carries an element and a class and so outranks a
   * lone hashed class. `text-align: right` was set and silently lost. Nothing failed;
   * the columns simply stayed wrong, and this comment claimed a fix that never landed.
   *
   * Alignment goes through Salt's `textAlign` prop now, which is the mechanism that
   * rule was written to serve. Only `right` is offered, because that is all Salt's
   * table cells accept and `left` is already the default — a union member resolving
   * to "do nothing" is an invitation to write it and expect something.
   */
  align?: 'right';
  /**
   * Tabular figures without right alignment.
   *
   * The coupling above is right for counts and wrong for timestamps, which is the
   * case that forced this apart. A column of `2026-08-04 01:22:11` wants its digits
   * to line up — proportional figures make two adjacent rows disagree by a pixel per
   * digit, which is exactly what makes scanning for a time range harder than it
   * should be — but right-aligning it would pull it away from the label beside it and
   * ragged-left a column whose values are all the same length anyway.
   *
   * So: `align` decides where the column sits, this decides how its digits are cut.
   * A count wants both and says `align: 'right'`; a timestamp wants only this.
   *
   * This half stays a CSS module class, and safely: Salt takes no position on figures
   * and sets no `font-variant-numeric` anywhere in its table, so unlike alignment
   * there is no rule of its own to be outranked by.
   */
  figures?: 'tabular';
  /**
   * Where this cell's value goes.
   *
   * The primary cell of a row that has a destination renders a real anchor, which is
   * what makes middle-click, "copy link address" and the screen-reader link role
   * work. A row-level click handler gives all three up, and this component carried
   * one for exactly as long as the kit had no way to build an href — see the note on
   * `onRowClick`, which this replaces.
   *
   * Returning `undefined` renders the value as plain text, for the rows in a list
   * that genuinely have nowhere to go.
   */
  href?: (row: TRow) => string | undefined;
}

export interface DataTableProps<TRow> {
  columns: ReadonlyArray<Column<TRow>>;
  rows: readonly TRow[];
  /**
   * Stable React key for a row.
   *
   * The index is passed as a second argument for rows that genuinely have no id of
   * their own — a fact with no `fact_id`, a derived row. It was previously *not*
   * passed, while one caller declared `(row, index = 0) => …`: the default fired
   * every time, so every id-less row collided on the key `"0"` and React reused
   * the wrong DOM nodes between renders.
   *
   * Prefer a real id where one exists. An index-keyed row is wrong the moment the
   * list is reordered or filtered.
   */
  getRowId: (row: TRow, index: number) => string;
  /**
   * Describes the table for a screen reader. Required rather than optional: a
   * table with no accessible name is announced as an unlabelled grid, which is
   * the point at which the content stops being navigable.
   */
  caption: string;
  /**
   * Keep the caption for assistive technology but take it off screen.
   *
   * For tables that already sit under a visible heading saying the same thing —
   * "Attributes" as a section heading, then "Attributes" again as a caption
   * directly beneath it. Removing the caption entirely would cost the table its
   * accessible name; hiding it visually keeps both correct.
   */
  hideCaption?: boolean;
  /**
   * Alternate the row background. Worth it once a table is wide enough that a
   * reader has to track one row across several columns; noise on a narrow one.
   *
   * Salt's own `zebra` prop, not a stripe of our own. This was hand-rolled in CSS
   * before, which duplicated a built-in, striped `nth-child(even)` where Salt
   * stripes `nth-of-type(odd)` — the opposite rows — and needed a specificity fix
   * to stop it beating the row hover.
   *
   * Turning it on also turns the row divider off: the reference separates rows with
   * one mechanism, and drawing both a stripe and a rule is what made our tables
   * look heavier than theirs.
   */
  zebra?: boolean;
  /**
   * Draw a bordered boundary around the table, running edge to edge.
   *
   * Owned here rather than by the caller so the loading and empty branches
   * *replace* the boundary instead of appearing inside it — `EmptyState` is itself
   * a card, and a card inside a card reads as a mistake.
   */
  card?: boolean;
  isLoading?: boolean;
  /**
   * The caller's query failed and the caller is already saying so.
   *
   * Suppresses the empty state, which is otherwise reached by falling through the
   * zero-rows branch — four pages rendered an error banner and "nothing has been
   * published in this tenant yet" one above the other. A failed query knows nothing
   * about whether the tenant is empty.
   */
  hasError?: boolean;
  /** Placeholder rows while the first page is in flight. */
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  /**
   * Heading level for the empty state's title. `h3` when the table sits inside a
   * `SectionCard`, whose own title is already an `h2` — otherwise the empty state
   * would announce as a sibling of the section that contains it.
   */
  emptyHeadingLevel?: 'h2' | 'h3';
}

/** Left is the default and needs no class. */
/**
 * The presentation half of a column, which is all this needs.
 *
 * Takes the two fields rather than the column, because `Column<TRow>` is generic
 * over the row type and a parameter typed `Column<unknown>` will not accept one —
 * the row type is unrelated to how its digits are cut.
 */
function cellProps({ align, figures }: Pick<Column<unknown>, 'align' | 'figures'>) {
  return {
    // Salt's prop rather than a class of ours: it emits `saltTable-td-align-right`,
    // which is the selector Salt's own `text-align` rule is keyed on. Anything else
    // is outranked by `table.saltTable td` and loses without ever saying so.
    ...(align === 'right' ? { textAlign: 'right' as const } : {}),
    // `align: 'right'` implies tabular. A count wants both; a timestamp asks for
    // figures alone and keeps its left edge.
    className: align === 'right' || figures === 'tabular' ? styles.tabular : undefined,
  };
}

export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  caption,
  hideCaption = false,
  zebra = false,
  card = false,
  isLoading = false,
  hasError = false,
  skeletonRows = 5,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyHeadingLevel = 'h2',
}: DataTableProps<TRow>) {
  /*
   * Error before empty.
   *
   * On a failed request four pages rendered their error banner *and* fell through to
   * here, so the reader was told the query failed and, directly beneath it, that the
   * tenant contains nothing. Those are different facts calling for different actions
   * — retry, versus publish something — and the second one is not known. When the
   * caller is already showing the failure, this renders nothing.
   */
  if (hasError && rows.length === 0) return null;

  /*
   * Loading before empty: an empty state shown while the first page is still in
   * flight tells the reader there is no data when nobody knows yet.
   *
   * The placeholder is built from `columns` — the same array that builds the real
   * header and the real cells — so it cannot describe a shape the table does not
   * have. That is the whole reason this kit can carry a skeleton at all: the
   * standing objection was that a hand-composed wireframe drifts from its content,
   * and there is no second description of the shape here to drift.
   */
  if (isLoading && rows.length === 0)
    return (
      <div aria-busy="true">
        <Text className="salt-visuallyHidden" role="status" aria-live="polite">
          {`Loading ${caption}`}
        </Text>
        <Table className={styles.table} zebra={zebra} divider={zebra ? 'none' : 'tertiary'}>
          <caption className={hideCaption ? 'salt-visuallyHidden' : undefined}>
            <Text color="secondary" styleAs="notation">
              {caption}
            </Text>
          </caption>
          <THead>
            <TR>
              {columns.map((column) => (
                <TH
                  key={column.key}
                  scope="col"
                  {...cellProps({ align: column.align, figures: column.figures })}
                >
                  {column.header}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {Array.from({ length: skeletonRows }, (_, rowIndex) => (
              <TR key={rowIndex}>
                {columns.map((column, columnIndex) => (
                  <TD key={column.key}>
                    <SkeletonBar index={rowIndex + columnIndex} />
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    );

  if (rows.length === 0)
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        headingLevel={emptyHeadingLevel}
      />
    );

  const table = (
    <Table className={styles.table} zebra={zebra} divider={zebra ? 'none' : 'tertiary'}>
      <caption className={hideCaption ? 'salt-visuallyHidden' : undefined}>
        <Text color="secondary" styleAs="notation">
          {caption}
        </Text>
      </caption>
      <THead>
        <TR>
          {columns.map((column) => (
            <TH
              key={column.key}
              scope="col"
              // The header aligns with its column: a right-aligned column of totals
              // under a left-aligned label reads as two columns that missed each other.
              {...cellProps({ align: column.align, figures: column.figures })}
            >
              {column.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR
            key={getRowId(row, index)}
            /*
             * The row is not the control; the link in its primary cell is.
             *
             * This carried a row-level click handler with a tab stop and a key
             * handler, because the correct pattern needs an href and this package
             * takes no router dependency. It does now, through the kit's own link
             * adapter — so the handler is gone rather than kept beside the link,
             * which would have left two ways to activate a row, one of them a
             * focusable div wrapping an anchor.
             *
             * The hover treatment stays, keyed on the table having a linked column
             * at all, so a row that goes somewhere still looks like it does.
             */
            className={columns.some((column) => column.href) ? styles.clickableRow : undefined}
          >
            {columns.map((column) => (
              <TD key={column.key} {...cellProps({ align: column.align, figures: column.figures })}>
                {(() => {
                  const content = column.render
                    ? column.render(row)
                    : displayText((row as Record<string, unknown>)[column.key]);
                  const href = column.href?.(row);
                  // Dense by default: a column of links reads as a ruled form if each
                  // one carries its own underline. Accent supplies the affordance and
                  // the underline returns on hover.
                  return href ? (
                    <KLink to={href} underline="never" color="primary">
                      {content}
                    </KLink>
                  ) : (
                    content
                  );
                })()}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return card ? <SectionCard flush>{table}</SectionCard> : table;
}
