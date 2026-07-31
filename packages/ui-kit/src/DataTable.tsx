import { TBody, TD, TH, THead, TR, Table, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { LoadingPanel } from './LoadingPanel';

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
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<TRow> {
  columns: ReadonlyArray<Column<TRow>>;
  rows: readonly TRow[];
  getRowId: (row: TRow) => string;
  /**
   * Describes the table for a screen reader. Required rather than optional: a
   * table with no accessible name is announced as an unlabelled grid, which is
   * the point at which the content stops being navigable.
   */
  caption: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  onRowClick?: (row: TRow) => void;
}

export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  caption,
  isLoading = false,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  onRowClick,
}: DataTableProps<TRow>) {
  // Loading before empty: an empty state shown while the first page is still in
  // flight tells the reader there is no data when nobody knows yet.
  if (isLoading && rows.length === 0) return <LoadingPanel label={`Loading ${caption}`} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <Table>
      <caption>
        <Text color="secondary" styleAs="notation">
          {caption}
        </Text>
      </caption>
      <THead>
        <TR>
          {columns.map((column) => (
            <TH key={column.key} scope="col">
              {column.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR
            key={getRowId(row)}
            // A clickable row must also be reachable and activatable from the
            // keyboard, or the interaction exists only for pointer users.
            {...(onRowClick
              ? {
                  onClick: () => onRowClick(row),
                  tabIndex: 0,
                  role: 'button',
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  },
                }
              : {})}
          >
            {columns.map((column) => (
              <TD key={column.key}>
                {column.render
                  ? column.render(row)
                  : String((row as Record<string, unknown>)[column.key] ?? '')}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
