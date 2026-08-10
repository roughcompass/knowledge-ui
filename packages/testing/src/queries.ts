import { screen, waitFor } from '@testing-library/react';

/**
 * A table with its data in it, rather than merely a table.
 *
 * `DataTable` renders a column-derived skeleton under the same `table` role while
 * its request is in flight, which is the point — the reader sees the shape of the
 * answer instead of a spinner, and nothing moves when the numbers land. It also
 * means `findByRole('table')` now resolves *before* the data exists, so every
 * assertion written as "find the table, then read a cell" started reading
 * placeholder rows. Ten tests broke that way on one page, all with the same
 * unhelpful "unable to find text" message.
 *
 * Waiting for the region to stop being `aria-busy` waits for exactly what a reader
 * waits for. It lives here rather than in each spec because the alternative was a
 * copy per test file, and a copy is the thing that goes stale when the loading
 * contract changes again.
 *
 * Use it wherever a test asserts on cell content. A test that only cares that a
 * table exists can keep using `findByRole`.
 */
export async function findLoadedTable(name: RegExp | string): Promise<HTMLElement> {
  await waitFor(() => {
    const table = screen.getByRole('table', { name });
    if (table.closest('[aria-busy="true"]') !== null) {
      throw new Error(`table "${String(name)}" is still loading`);
    }
  });
  return screen.getByRole('table', { name });
}
