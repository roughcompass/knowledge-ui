import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BarSeries, Figure, shares } from '../index';

/**
 * The pairing, and the arithmetic underneath it.
 *
 * A chart in this console is never allowed to be the only representation of its
 * data. The reason is not only assistive technology: a reader who needs an exact
 * figure, one checking a number before quoting it, and one whose SVG failed to
 * paint are all served by the same visible rows — and a table cannot drift out
 * of sync with the chart, because it is the same array.
 */

const BARS = [
  { label: 'search_capabilities', value: 40 },
  { label: 'get_capability', value: 10 },
  { label: 'get_blast_radius', value: 0 },
];

const renderFigure = () =>
  render(
    <Figure
      caption="MCP tool calls"
      mark={<BarSeries bars={BARS} />}
      rows={BARS}
      columns={[
        { key: 'label', header: 'Tool' },
        { key: 'value', header: 'Calls' },
      ]}
      getRowId={(row) => row.label}
    />,
  );

describe('the chart and its table', () => {
  it('renders the table whenever it renders the mark', () => {
    // The property the component exists for. There is no prop that suppresses
    // the table, so this is really asserting that none was added.
    renderFigure();
    const table = screen.getByRole('table');
    expect(within(table).getByText('search_capabilities')).toBeInTheDocument();
    expect(within(table).getByText('40')).toBeInTheDocument();
  });

  it('keeps the mark out of the accessibility tree', () => {
    /*
     * With the table present, announcing the mark would read the same numbers a
     * second time with none of the structure. The mark is decoration precisely
     * because the information is guaranteed to be somewhere better.
     */
    const { container } = renderFigure();
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.textContent).toContain('search_capabilities');
  });

  it('names the figure through the table caption rather than decoratively', () => {
    renderFigure();
    expect(screen.getByText('MCP tool calls')).toBeInTheDocument();
  });

  it('shows a category that was never used rather than dropping it', () => {
    // A zero row is one of the most informative rows a surface-mix figure has:
    // it is how an unused tool becomes visible. Omitting it would make the
    // surface look smaller and healthier than it is.
    renderFigure();
    // Asserted against the table specifically: the label also appears in the
    // mark, and it is the row that has to survive.
    const table = screen.getByRole('table');
    expect(within(table).getByText('get_blast_radius')).toBeInTheDocument();
    expect(within(table).getByText('0')).toBeInTheDocument();
  });
});

describe('bar widths', () => {
  it('scales against the largest bar, not the total', () => {
    /*
     * Share-of-total would read as a composition — parts of one whole — which is
     * wrong for independent counts. Normalising to the maximum compares them
     * without implying they sum to anything.
     */
    expect(shares(BARS)).toEqual([100, 25, 0]);
  });

  it('renders every bar empty rather than dividing by zero', () => {
    // A surface nobody used at all is a real state, and the honest rendering is
    // a row of empty tracks.
    expect(shares([{ label: 'a', value: 0 }, { label: 'b', value: 0 }])).toEqual([0, 0]);
  });

  it('treats a negative or non-finite value as zero', () => {
    // Neither is meaningful for a count, and both would otherwise produce a
    // negative width or NaN — which renders as a bar that silently vanishes.
    expect(shares([{ label: 'a', value: -5 }, { label: 'b', value: 10 }])).toEqual([0, 100]);
    expect(shares([{ label: 'a', value: Number.NaN }, { label: 'b', value: 4 }])).toEqual([0, 100]);
  });
});
