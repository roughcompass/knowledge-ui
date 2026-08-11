import { Panel, StackLayout, Text } from '@salt-ds/core';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * A column chart: one measure, one column per position along an ordered axis.
 *
 * ## Why a library, having argued against one
 *
 * The hand-built version drew proportional `div`s, which is genuinely the smallest
 * thing that shows relative magnitude — and it stopped there. It had no value axis,
 * so the same six columns looked identical whether the peak was fifty calls or
 * fifty thousand; no gridlines, so two columns of similar height could not be
 * ranked; and no hover, so reading one day's figure meant finding its row in the
 * table. Each of those is a day's work to build and a permanent thing to maintain,
 * and all three are one prop here.
 *
 * The cost is real and was measured rather than estimated: ~112 KB gz. It is paid
 * behind a lazy boundary — see `LazyColumnChart` — so it is not in any remote's
 * initial federated graph and the bundle budgets stay where they were.
 *
 * ## Colours come from Salt
 *
 * Recharts receives only published Salt theme tokens. There is no application
 * palette or stylesheet, so axes, grid, cursor and series continue to adapt to the
 * selected Salt mode.
 *
 * ## Still paired with a table
 *
 * This is passed to `Figure` as its mark and is hidden from assistive technology.
 * The table beside it carries the same numbers and is the exact, navigable copy —
 * that contract did not change, and the tooltip below is a convenience over it
 * rather than a replacement for it.
 */

export interface Bar {
  label: string;
  value: number;
}

/**
 * How many tick labels the axis can carry before they collide.
 *
 * `recharts` decides tick placement itself given an interval, and its
 * `preserveStartEnd` keeps the first and last — which is what a time series wants,
 * because the most recent point is the one a reader looks for first. The interval
 * is computed rather than fixed so a week shows every day and a quarter thins to
 * roughly eight.
 */
export function tickInterval(count: number): number {
  return Math.max(0, Math.ceil(count / 8) - 1);
}

/** Axis figures stay short: 12,400 reads as 12.4k at tick size. */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number }>;
  label?: string | number;
  valueLabel: string;
}) {
  const datum = payload?.[0];
  if (active !== true || datum?.value === undefined) return null;

  return (
    <Panel variant="primary">
      <StackLayout gap={1}>
        <Text styleAs="notation" color="secondary">
          {String(label)}
        </Text>
        <Text styleAs="label">{`${datum.value.toLocaleString()} ${valueLabel}`}</Text>
      </StackLayout>
    </Panel>
  );
}

export function ColumnChart({
  bars,
  valueLabel,
}: {
  bars: readonly Bar[];
  /** What one unit is, for the tooltip: "calls", "entities". Never a sentence. */
  valueLabel: string;
}) {
  /*
   * An all-zero series is a real state — a window nobody used — and the chart says
   * so rather than drawing a flat row of nothing, which reads as a failed render.
   */
  if (bars.length === 0 || bars.every((b) => !Number.isFinite(b.value) || b.value <= 0)) {
    return (
      <Text styleAs="notation" color="secondary">
        No activity in this window
      </Text>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={[...bars]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {/*
            Horizontal rules only. Vertical ones would divide the columns from each
            other, which the 2px gap already does, and a full lattice reads as
            graph paper rather than as a scale.
          */}
        <CartesianGrid
          stroke="var(--salt-separable-secondary-borderColor)"
          strokeDasharray="2 4"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          stroke="var(--salt-separable-tertiary-borderColor)"
          tick={{ fill: 'var(--salt-content-secondary-foreground)' }}
          tickLine={false}
          interval={tickInterval(bars.length)}
          /* Keeps the first and last position named however the interval falls. */
          minTickGap={0}
        />
        <YAxis
          stroke="var(--salt-separable-tertiary-borderColor)"
          tick={{ fill: 'var(--salt-content-secondary-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={compactNumber}
          /*
           * From zero, always. A truncated value axis exaggerates differences
           * between columns, which for a count is a false claim about the data —
           * and the one distortion a bar chart must never make.
           */
          domain={[0, 'auto']}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--salt-palette-alpha-contrast-low)' }}
          content={<ChartTooltip valueLabel={valueLabel} />}
        />
        <Bar
          dataKey="value"
          fill="var(--salt-category-1-dataviz)"
          /*
           * Rounded at the free end only, anchored to the baseline. Rounding the
           * bottom would lift the column off the axis it is measured from.
           */
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
