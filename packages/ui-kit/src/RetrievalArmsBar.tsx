import { FlexLayout, StackLayout, Text, Tooltip } from '@salt-ds/core';

import styles from './RetrievalArmsBar.module.css';

/**
 * How much each retrieval arm contributed to a search score.
 *
 * The registry fuses three independent arms — semantic, lexical and graph — and
 * returns each one's contribution alongside the total. That breakdown is the
 * most interesting thing on a search result and there is no Salt component for
 * it, so this is one of the three places a stylesheet is warranted.
 *
 * Accessibility is the reason this is not just three coloured boxes: the shape
 * carries the information, so it needs an accessible name that carries the same
 * information in words.
 */

export interface RetrievalArms {
  semantic?: number | undefined;
  lexical?: number | undefined;
  graph?: number | undefined;
}

const ARMS = [
  { key: 'semantic', label: 'Semantic', className: styles.semantic },
  { key: 'lexical', label: 'Lexical', className: styles.lexical },
  { key: 'graph', label: 'Graph', className: styles.graph },
] as const;

/** Percentage share per arm. Returns null when nothing contributed. */
export function armShares(arms: RetrievalArms): Array<{ key: string; label: string; pct: number }> | null {
  const values = ARMS.map((arm) => ({ ...arm, value: Math.max(0, arms[arm.key] ?? 0) }));
  const total = values.reduce((acc, v) => acc + v.value, 0);
  // Every arm zero is a real outcome: a result can be returned by an arm whose
  // reported contribution rounds to nothing. Dividing would give NaN widths.
  if (total <= 0) return null;
  return values.map((v) => ({ key: v.key, label: v.label, pct: (v.value / total) * 100 }));
}

export function RetrievalArmsBar({
  arms,
  score,
  showLegend = false,
}: {
  arms: RetrievalArms;
  score: number;
  showLegend?: boolean;
}) {
  const shares = armShares(arms);

  if (!shares) {
    return (
      <Text color="secondary" styleAs="notation">
        no arm breakdown
      </Text>
    );
  }

  const spoken = shares
    .filter((s) => s.pct > 0)
    .map((s) => `${s.label} ${s.pct.toFixed(0)} percent`)
    .join(', ');

  return (
    <StackLayout gap={1}>
      <Tooltip content={`Score ${score.toFixed(3)} — ${spoken}`}>
        <div
          className={styles.track}
          role="img"
          aria-label={`Retrieval score ${score.toFixed(3)}. Contributions: ${spoken}.`}
        >
          {shares.map((share) =>
            share.pct > 0 ? (
              <div
                key={share.key}
                className={`${styles.segment} ${ARMS.find((a) => a.key === share.key)?.className ?? ''}`}
                // The only inline value in the component, and it has to be
                // inline: the width is data, and a stylesheet cannot express a
                // number that arrives at runtime.
                style={{ inlineSize: `${share.pct}%` }}
              />
            ) : null,
          )}
        </div>
      </Tooltip>
      {showLegend ? (
        <FlexLayout gap={2} className={styles.legend}>
          {shares.map((share) => (
            <FlexLayout key={share.key} gap={1} align="center">
              <span
                className={`${styles.swatch} ${ARMS.find((a) => a.key === share.key)?.className ?? ''}`}
                aria-hidden="true"
              />
              <Text styleAs="notation" color="secondary">
                {share.label} {share.pct.toFixed(0)}%
              </Text>
            </FlexLayout>
          ))}
        </FlexLayout>
      ) : null}
    </StackLayout>
  );
}
