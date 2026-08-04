import { Text } from '@salt-ds/core';

import styles from './BarSeries.module.css';

/**
 * Categorical comparison: one measure, several categories.
 *
 * Built from `div`s rather than SVG deliberately. The shape is a set of
 * proportional lengths, which CSS already expresses exactly, and a hand-rolled
 * SVG would reimplement text wrapping and reflow to get the labels right. The
 * mark that genuinely needs SVG is the trend line, and `Sparkline` already is
 * one.
 *
 * Intended to be passed to `Figure`, which pairs it with the table carrying the
 * same numbers. It is exported separately only because `Figure` takes the mark
 * as a node; a lint rule keeps it from being rendered on its own.
 */

export interface Bar {
  label: string;
  value: number;
}

/**
 * Widths as a share of the largest bar, not of the total.
 *
 * A share-of-total reads as a composition — parts of one whole — which is wrong
 * for "how often was each tool called": those are independent counts, not slices
 * of anything. Normalising to the maximum compares them without implying they
 * sum to something.
 */
export function shares(bars: readonly Bar[]): number[] {
  const values = bars.map((b) => (Number.isFinite(b.value) ? Math.max(b.value, 0) : 0));
  const max = Math.max(...values, 0);
  // Every bar empty is a real state — a surface nobody used — and it renders as
  // a row of empty tracks rather than as a division by zero.
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v / max) * 100);
}

export function BarSeries({ bars }: { bars: readonly Bar[] }) {
  const widths = shares(bars);

  return (
    <div>
      {bars.map((bar, index) => (
        <div className={styles.row} key={bar.label}>
          <Text styleAs="notation" color="secondary">
            {bar.label}
          </Text>
          <div className={styles.track}>
            <div
              className={widths[index] === 0 ? styles.empty : styles.fill}
              style={{ inlineSize: `${widths[index]}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
