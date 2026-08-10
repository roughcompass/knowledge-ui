import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Figure, compactNumber, tickInterval } from '../index';

/**
 * The pairing, and the two pieces of chart arithmetic this package still owns.
 *
 * A chart in this console is never allowed to be the only representation of its
 * data. The reason is not only assistive technology: a reader who needs an exact
 * figure, one checking a number before quoting it, and one whose chart chunk failed
 * to load are all served by the same visible rows — and the table cannot drift out
 * of sync with the chart, because it is the same array.
 *
 * The scaling and tick placement that used to be tested here belong to `recharts`
 * now, and testing a dependency's arithmetic through our own wrapper would assert
 * nothing about this code. What is left is the interval we ask for and the tick
 * format we supply, both of which are ours to get wrong.
 */

const BARS = [
  { label: 'search_capabilities', value: 40 },
  { label: 'get_capability', value: 10 },
  { label: 'get_blast_radius', value: 0 },
];

const renderFigure = ({ isLoading = false } = {}) =>
  render(
    <Figure
      caption="MCP tool calls"
      // A plain node rather than the real chart: `ResponsiveContainer` measures its
      // parent, and jsdom reports every parent as zero, so the real mark renders an
      // empty SVG here and would assert nothing either way.
      mark={<div data-testid="mark" />}
      // Empty while loading, which is the real state: the rows arrive with the
      // response. `DataTable` draws its skeleton only when it is loading *and* has
      // no rows — deliberately, so a refetch does not blank rows already on screen.
      rows={isLoading ? [] : BARS}
      columns={[
        { key: 'label', header: 'Tool' },
        { key: 'value', header: 'Calls' },
      ]}
      getRowId={(row) => row.label}
      isLoading={isLoading}
    />,
  );

describe('the chart and its table', () => {
  it('renders the table whenever it renders the mark', () => {
    // The property the component exists for. There is no prop that suppresses the
    // table, so this is really asserting that none was added.
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
    renderFigure();
    const mark = screen.getByTestId('mark');
    expect(mark.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('names the figure through the table caption rather than decoratively', () => {
    renderFigure();
    expect(screen.getByText('MCP tool calls')).toBeInTheDocument();
  });

  it('holds the mark space while loading instead of drawing a chart of no data', () => {
    /*
     * Two properties at once. The mark is not rendered — a chart drawn from an empty
     * series asserts a shape nobody measured — and its box stays, so the panel does
     * not grow by the height of a chart when the data lands. That second half is the
     * whole reason this is a skeleton rather than a spinner.
     */
    const { container } = renderFigure({ isLoading: true });
    expect(screen.queryByTestId('mark')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('how many ticks the axis is asked for', () => {
  /*
   * `recharts` places ticks itself given an interval, where the interval is how many
   * positions to skip between labels. Zero means label every position.
   */
  it('labels every column while they still fit', () => {
    expect(tickInterval(1)).toBe(0);
    expect(tickInterval(8)).toBe(0);
  });

  it('thins past about a week, so a month and a quarter stay readable', () => {
    // The failure this prevents is not overlap but illegibility: every label drawn
    // at 31 positions collides into a grey band, which reads as text too small to
    // bother with rather than as too many labels.
    expect(tickInterval(16)).toBe(1);
    expect(tickInterval(31)).toBe(3);
    expect(tickInterval(90)).toBe(11);
    expect(tickInterval(365)).toBe(45);
  });

  it('never returns a negative interval', () => {
    // An empty series reaches here through the same path, and a negative interval
    // makes the library throw rather than draw nothing.
    expect(tickInterval(0)).toBe(0);
  });
});

describe('axis figures', () => {
  it('keeps a large count short enough to read at tick size', () => {
    // A y-axis of "1200000" pushes the plot right and is unreadable at 11px.
    expect(compactNumber(12_400)).toBe('12.4k');
    expect(compactNumber(1_200_000)).toBe('1.2M');
  });

  it('leaves a small count exact', () => {
    // Rounding a count of 40 to "0.0k" would be a rounding error a reader cannot
    // see through, and most windows on this page are small counts.
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(40)).toBe('40');
    expect(compactNumber(999)).toBe('999');
  });
});
