import { renderWithProviders } from '@knowledge-ui/testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type Column } from '../DataTable';

/**
 * The table's presentation contract, and one defect that shipped twice.
 *
 * Alignment on a numeric column was declared and not read, then read and silently
 * outranked by Salt's own `table.saltTable td` rule. Both times the columns simply
 * stayed wrong and nothing failed — a CSS declaration that loses a specificity
 * contest is invisible to every gate this repo has. jsdom computes no stylesheets
 * either, so the assertion has to be about the mechanism rather than the pixels:
 * Salt's `textAlign` prop emits a class its own rule is keyed on, so the class
 * being present is the thing that means alignment will happen.
 */

type Row = { id: string; name: string; calls: number; day: string };

const ROWS: Row[] = [
  { id: 'a', name: 'salt-design-system', calls: 3110, day: '2026-08-01' },
  { id: 'b', name: 'identity', calls: 902, day: '2026-08-02' },
];

function render(columns: Array<Column<Row>>) {
  return renderWithProviders(
    <DataTable caption="Usage" columns={columns} rows={ROWS} getRowId={(row) => row.id} />,
  );
}

describe('column alignment', () => {
  it('aligns a numeric column through Salt, not through a class of our own', async () => {
    render([
      { key: 'name', header: 'Capability' },
      { key: 'calls', header: 'Calls', align: 'right' },
    ]);

    const table = await screen.findByRole('table', { name: /usage/i });
    const callsHeader = within(table).getByRole('columnheader', { name: 'Calls' });
    expect(callsHeader.className).toContain('saltTable-th-align-right');

    // And every cell in that column, not only the header — a right-aligned label
    // over left-aligned totals is worse than leaving both alone.
    for (const cell of within(table).getAllByRole('cell')) {
      if (/^[\d,]+$/.test(cell.textContent ?? '')) {
        expect(cell.className).toContain('saltTable-td-align-right');
      }
    }
  });

  it('leaves a column with no alignment at Salt default', async () => {
    render([
      { key: 'name', header: 'Capability' },
      { key: 'calls', header: 'Calls' },
    ]);

    const table = await screen.findByRole('table', { name: /usage/i });
    for (const cell of within(table).getAllByRole('cell')) {
      expect(cell.className).not.toContain('align-right');
    }
  });

  it('gives a timestamp column tabular figures without pushing it right', async () => {
    /*
     * The case that forced alignment and figures apart. A column of dates wants its
     * digits to line up — proportional figures make adjacent rows disagree by a pixel
     * per digit — but right-aligning it would pull it off the left edge it shares with
     * its label and ragged-left a column whose values are all the same length.
     */
    render([
      { key: 'name', header: 'Capability' },
      { key: 'day', header: 'Day', figures: 'tabular' },
    ]);

    const table = await screen.findByRole('table', { name: /usage/i });
    const dayCell = within(table).getByText('2026-08-01');
    expect(dayCell.className).not.toContain('align-right');
    // The figures class is hashed by the CSS module, so its identity is not
    // assertable; that it is *there* alongside Salt's own classes is.
    expect(dayCell.className.split(' ').length).toBeGreaterThan(2);
  });
});

describe('link cells', () => {
  it('renders an href column as an accent link with no rest underline', async () => {
    render([
      { key: 'name', header: 'Capability', href: (row) => `/catalog/${row.id}` },
      { key: 'calls', header: 'Calls' },
    ]);

    const link = await screen.findByRole('link', { name: 'salt-design-system' });
    // Salt's own color API: accent is what separates the one clickable thing in
    // the row from the plain text beside it.
    expect(link.className).toContain('saltLink-accent');
    expect(link.className).toContain('saltLink-underlineNever');
  });

  it('gives rows the hover treatment when a column carries an href', async () => {
    render([{ key: 'name', header: 'Capability', href: (row) => `/catalog/${row.id}` }]);

    const table = await screen.findByRole('table', { name: /usage/i });
    const [, ...bodyRows] = within(table).getAllByRole('row');
    for (const row of bodyRows) expect(row.className).toContain('clickableRow');
  });

  it('gives rows the hover treatment when a render-based column declares `linked`', async () => {
    // The table cannot see inside a ReactNode, so a column whose `render` builds
    // its own anchors has to say so to get the same affordance href columns get.
    render([
      {
        key: 'name',
        header: 'Capability',
        linked: true,
        render: (row) => <a href={`/catalog/${row.id}`}>{row.name}</a>,
      },
    ]);

    const table = await screen.findByRole('table', { name: /usage/i });
    const [, ...bodyRows] = within(table).getAllByRole('row');
    for (const row of bodyRows) expect(row.className).toContain('clickableRow');
  });

  it('leaves rows static when no column links anywhere', async () => {
    render([{ key: 'name', header: 'Capability' }]);

    const table = await screen.findByRole('table', { name: /usage/i });
    const [, ...bodyRows] = within(table).getAllByRole('row');
    for (const row of bodyRows) expect(row.className).not.toContain('clickableRow');
  });
});

describe('the horizontal overflow container', () => {
  it('wraps the table in a scroll container instead of letting a card clip it', async () => {
    render([{ key: 'name', header: 'Capability' }]);

    const table = await screen.findByRole('table', { name: /usage/i });
    // nowrap cells make a wide table clip mid-value at the card edge with
    // nothing saying more exists; the container is what lets it scroll.
    expect(table.parentElement?.className).toContain('scroll');
  });
});

describe('the detail row', () => {
  const detailColumns: Array<Column<Row>> = [
    { key: 'name', header: 'Capability' },
    { key: 'calls', header: 'Calls' },
  ];

  it('renders the panel directly beneath the matching row, spanning every column', async () => {
    renderWithProviders(
      <DataTable
        caption="Usage"
        columns={detailColumns}
        rows={ROWS}
        getRowId={(row) => row.id}
        renderDetail={(row) => <span>{`Detail for ${row.name}`}</span>}
        expandedRowId="a"
      />,
    );

    const table = await screen.findByRole('table', { name: /usage/i });
    const rows = within(table).getAllByRole('row');
    // Header, row a, its detail, row b.
    expect(rows).toHaveLength(4);
    const detailRow = rows[2];
    if (!detailRow) throw new Error('detail row missing');
    expect(detailRow).toHaveTextContent('Detail for salt-design-system');
    const cell = within(detailRow).getByRole('cell');
    expect(cell).toHaveAttribute('colspan', String(detailColumns.length));
  });

  it('renders no detail row while none is expanded', async () => {
    renderWithProviders(
      <DataTable
        caption="Usage"
        columns={detailColumns}
        rows={ROWS}
        getRowId={(row) => row.id}
        renderDetail={(row) => <span>{`Detail for ${row.name}`}</span>}
        expandedRowId={null}
      />,
    );

    const table = await screen.findByRole('table', { name: /usage/i });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText(/Detail for/)).not.toBeInTheDocument();
  });
});

describe('the default cell', () => {
  it('renders a value with no `render` as text, and an object as its data', async () => {
    // `String(someObject)` is `[object Object]`, which a reader cannot tell from a
    // real value — so the field it replaced disappears and nobody reports it.
    const rows = [{ id: 'a', label: { state: 'beta' } }];
    renderWithProviders(
      <DataTable
        caption="Attributes"
        columns={[{ key: 'label', header: 'Label' }]}
        rows={rows}
        getRowId={(row) => row.id}
      />,
    );

    expect(await screen.findByText('{"state":"beta"}')).toBeInTheDocument();
  });
});
