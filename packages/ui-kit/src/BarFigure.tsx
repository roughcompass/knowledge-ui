import { Figure } from './Figure';
import { LazyColumnChart } from './LazyColumnChart';
import type { Bar } from './ColumnChart';
import type { Column } from './DataTable';

/**
 * A column chart and its table, ready to use from a screen.
 *
 * ## Why this exists at all
 *
 * `Figure` takes its mark as a prop, and the marks are unimportable outside this
 * package — a restricted-import rule, so that the only route to a chart is the one
 * that carries its data. Both halves of that are right, and together they made
 * `Figure` impossible to use from a remote: building a mark requires importing one.
 *
 * That is very likely why the chart primitives sat with no consumers at all for as
 * long as they did. The rule did not merely discourage a shortcut, it closed the
 * sanctioned path too, and the way out of that trap is a composite in the package
 * that already holds the marks — not an exemption at the call site, which would
 * reopen exactly the hole the rule exists to close.
 *
 * So a screen imports this, passes the same data twice — once as bars, once as rows
 * — and cannot render the chart without the table because there is no prop that
 * omits it.
 *
 * ## Why the caller maps the bars itself
 *
 * `bars` and `rows` are separate parameters rather than one list plus accessors.
 * Accessors would let the bars be derived from a different field than the table
 * shows, which is the one divergence the pairing exists to prevent, and a caller
 * passing the same array twice is easy to read and hard to get subtly wrong.
 */
export function BarFigure<TRow>({
  caption,
  description,
  bars,
  valueLabel,
  rows,
  columns,
  getRowId,
  isLoading = false,
}: {
  caption: string;
  description?: React.ReactNode;
  bars: readonly Bar[];
  /** What one unit is, for the chart's tooltip: "calls", "entities". Not a sentence. */
  valueLabel: string;
  rows: readonly TRow[];
  columns: ReadonlyArray<Column<TRow>>;
  getRowId: (row: TRow) => string;
  /** Draw the figure's own placeholder rather than a spinner beside it. */
  isLoading?: boolean;
}) {
  return (
    <Figure
      caption={caption}
      description={description}
      mark={<LazyColumnChart bars={bars} valueLabel={valueLabel} />}
      rows={rows}
      columns={columns}
      getRowId={getRowId}
      isLoading={isLoading}
    />
  );
}
