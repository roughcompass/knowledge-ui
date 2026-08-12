import { Avatar, FlexItem, FlexLayout, StackLayout, StatusIndicator, Text } from '@salt-ds/core';
import { ChartBarIcon } from '@salt-ds/icons';
import type { ReactNode } from 'react';

import { SectionCard } from './SectionCard';
import { SkeletonBar } from './Skeleton';

/**
 * One readout: what it is, what it says, and where it came from.
 *
 * The reference's dashboards are built almost entirely from this shape — a small
 * label, a prominent value, a line of provenance underneath — and this repo had
 * grown seven hand-rolled copies of it across `HealthPage` and `MetricsPage`, four
 * of them on a raw Salt `Card` that still carried the at-rest shadow the reference
 * does not use.
 *
 * Two things it owns that the copies got wrong:
 *
 * The label is a real heading. Each copy used `Text styleAs="label"` with no `as`,
 * so a page of readouts had one `h1` and no other structure — a screen-reader user
 * navigating by heading could not reach any individual tile. `styleAs` and `as` are
 * separate props for exactly this: the label keeps its 12px treatment while the
 * element becomes an `h2`.
 *
 * `status` is optional and separate from `value`. A readout that is merely a number
 * has no status, and giving it a neutral indicator implies a health judgement that
 * has not been made.
 */
export function StatTile({
  label,
  value,
  hint,
  status,
  badge,
  visual,
  action,
  headingLevel = 'h2',
  isLoading = false,
}: {
  label: string;
  /**
   * The reading. A `ReactNode` because callers legitimately differ: a gauge is a
   * large number, a health probe is a sentence, a counter is a sparkline.
   */
  value: ReactNode;
  /** Where the number came from, or what it means. Secondary, one line. */
  hint?: ReactNode;
  /** Renders an indicator beside the value. Omit when the reading is not a verdict. */
  status?: 'success' | 'warning' | 'error' | 'info';
  /**
   * A qualifier on the reading, top-right of the label row.
   *
   * For the thing a reader checks in the same glance as the number itself — a
   * proportion of a limit, a hit rate, a direction of travel. It sits opposite the
   * label rather than beneath the value because it qualifies *what this is*, not
   * what it says; putting it under the number makes it read as a second reading.
   *
   * Not a place for a status verdict. That is `status`, which draws an indicator
   * the design system already gives a meaning to.
   */
  badge?: ReactNode;
  /**
   * A visual anchor to the left of the reading. Prefer a Salt Avatar carrying an
   * icon that identifies the metric's subject; omit it for the neutral chart mark.
   * Decorative only — the heading and value remain the complete reading.
   */
  visual?: ReactNode;
  /** One control, for the action the reading most obviously prompts. */
  action?: ReactNode;
  /** Set to `h3` when the tile sits under a section heading rather than the page title. */
  headingLevel?: 'h2' | 'h3';
  /**
   * Draw the tile's own placeholder in place of the reading.
   *
   * The label is real and stays — it is known before the number is, so there is no
   * reason to withhold it, and a row of tiles that already say what they will
   * measure is more informative while loading than a row of spinners. The value,
   * the hint and the badge become bars only where the real thing would have been,
   * which is what keeps the tile from changing size when the number lands.
   */
  isLoading?: boolean;
}) {
  const metricVisual = visual ?? (
    <Avatar color="accent" fallbackIcon={<ChartBarIcon aria-hidden />} size={1} aria-hidden />
  );

  return (
    <SectionCard>
      <FlexLayout gap={2} align="start">
        {metricVisual}
        <FlexItem grow={1}>
          <StackLayout gap={1}>
            <FlexLayout gap={2} align="center" justify="space-between">
              <Text styleAs="label" as={headingLevel} color="secondary">
                {label}
              </Text>
              {isLoading ? <SkeletonBar index={1} /> : badge}
            </FlexLayout>

            <StackLayout gap={0.5}>
              {/*
                The reading at display size. It rendered bare and inherited 14px body,
                so a metric — the one thing a tile exists to show — was the same size
                as its own caption. 24px is the only display number on a page, which
                is what makes a row of tiles scannable.
              */}
              {isLoading ? (
                // At display size, so the bar occupies exactly the line the number
                // will: the tile does not grow by 10px when the value arrives.
                <Text styleAs="h2" as="div">
                  <SkeletonBar index={0} />
                </Text>
              ) : status === undefined ? (
                <Text styleAs="h2" as="div">
                  {value}
                </Text>
              ) : (
                <FlexLayout gap={1} align="center">
                  <StatusIndicator status={status} />
                  <Text styleAs="h2" as="div">
                    {value}
                  </Text>
                </FlexLayout>
              )}
              {isLoading || hint !== undefined ? (
                <Text styleAs="notation" color="secondary">
                  {isLoading ? <SkeletonBar index={2} /> : hint}
                </Text>
              ) : null}
            </StackLayout>

            {action}
          </StackLayout>
        </FlexItem>
      </FlexLayout>
    </SectionCard>
  );
}
