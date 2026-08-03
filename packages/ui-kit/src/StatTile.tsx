import { FlexLayout, StackLayout, StatusIndicator, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { SectionCard } from './SectionCard';

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
  headingLevel = 'h2',
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
  /** Set to `h3` when the tile sits under a section heading rather than the page title. */
  headingLevel?: 'h2' | 'h3';
}) {
  return (
    <SectionCard>
      <StackLayout gap={1}>
        <Text styleAs="label" as={headingLevel}>
          {label}
        </Text>
        {status === undefined ? (
          value
        ) : (
          <FlexLayout gap={1} align="center">
            <StatusIndicator status={status} />
            {value}
          </FlexLayout>
        )}
        {hint !== undefined ? (
          <Text styleAs="notation" color="secondary">
            {hint}
          </Text>
        ) : null}
      </StackLayout>
    </SectionCard>
  );
}
