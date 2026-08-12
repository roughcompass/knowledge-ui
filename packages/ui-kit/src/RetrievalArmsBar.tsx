import { FlexLayout, LinearProgress, StackLayout, Text, Tooltip } from '@salt-ds/core';

/**
 * How much each retrieval arm contributed to a search score.
 *
 * The contextplane fuses three independent arms — semantic, lexical and graph — and
 * returns each one's contribution alongside the total. The breakdown uses Salt
 * progress and typography components so its shape, labels and theme all remain
 * owned by the design system.
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
  { key: 'semantic', label: 'Semantic' },
  { key: 'lexical', label: 'Lexical' },
  { key: 'graph', label: 'Graph' },
] as const;

/** Percentage share per arm. Returns null when nothing contributed. */
export function armShares(
  arms: RetrievalArms,
): Array<{ key: string; label: string; pct: number }> | null {
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
  showLegend = true,
}: {
  arms: RetrievalArms;
  score: number;
  /**
   * On by default. Three colours with no key is a chart that cannot be read, and
   * defaulting this to `false` meant no caller ever turned it on — the product
   * shipped the segments with the mapping available only to a hover or a screen
   * reader. Opt out for a dense column where the legend repeats per row.
   */
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
        <StackLayout
          gap={1}
          role="img"
          aria-label={`Retrieval score ${score.toFixed(3)}. Contributions: ${spoken}.`}
        >
          {shares.map((share) =>
            share.pct > 0 ? (
              <LinearProgress
                key={share.key}
                value={share.pct}
                aria-label={`${share.label} ${share.pct.toFixed(0)} percent`}
              />
            ) : null,
          )}
        </StackLayout>
      </Tooltip>
      {showLegend ? (
        <FlexLayout gap={2} wrap>
          {shares.map((share) => (
            <FlexLayout key={share.key} gap={1} align="center">
              <Text styleAs="notation">{share.label}</Text>
              <Text styleAs="notation" color="secondary">{`${share.pct.toFixed(0)}%`}</Text>
            </FlexLayout>
          ))}
        </FlexLayout>
      ) : null}
    </StackLayout>
  );
}

/**
 * The colour key on its own, for when the bar repeats.
 *
 * A legend belongs once per chart, not once per mark. In a results table the bar
 * appears on every row, so the per-bar legend is switched off there and this is
 * rendered a single time above the table. It carries no percentages because it
 * describes the encoding, not any particular row.
 */
export function RetrievalArmsLegend() {
  return (
    <FlexLayout gap={2} wrap align="center">
      <Text styleAs="notation" color="secondary">
        Retrieval arms
      </Text>
      {ARMS.map((arm) => (
        <Text key={arm.key} styleAs="notation">
          {arm.label}
        </Text>
      ))}
    </FlexLayout>
  );
}
