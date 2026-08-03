import { StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { SectionCard } from './SectionCard';

/**
 * Shown when a request succeeded and returned nothing.
 *
 * Distinct from an error on purpose: "no results" and "the request failed" are
 * different facts, and collapsing them sends people looking for a bug that is
 * not there.
 *
 * Centring comes from the layout component rather than a text-align rule, which
 * keeps this free of a stylesheet.
 *
 * The surface is `SectionCard`, not a raw Salt `Card`. A raw card brings an at-rest
 * shadow, a 9px radius and a 0.3-alpha border, so an empty table used to be the
 * heaviest-looking thing on the page — the state with the least to say drew the most
 * attention.
 *
 * The title is a real `h2`. `styleAs="h4"` alone produced heading-*looking* text
 * that no screen reader could navigate to, on the one screen where knowing why
 * there is nothing to read matters most.
 */
export function EmptyState({
  title,
  description,
  action,
  headingLevel = 'h2',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Set to `h3` when the empty region sits under a section heading. */
  headingLevel?: 'h2' | 'h3';
}) {
  return (
    <SectionCard>
      <StackLayout gap={1} align="center">
        <Text styleAs="h4" as={headingLevel}>
          {title}
        </Text>
        {description ? <Text color="secondary">{description}</Text> : null}
        {action}
      </StackLayout>
    </SectionCard>
  );
}
