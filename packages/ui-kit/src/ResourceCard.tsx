import { BorderItem, BorderLayout, Card, FlexLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { CardHeading } from './CardHeading';
import { LinkButton } from './LinkButton';

/**
 * An equal-height destination card with its action anchored to the bottom edge.
 *
 * `BorderLayout` renders as Salt's `Card`, so the card itself owns a north title
 * area and a south action area with a flexible center track between them. Peer
 * cards can therefore carry different title and description lengths without
 * moving their actions to different rows. The explicit Salt padding multiplier
 * preserves `Card`'s standard 24px inset after `BorderLayout` takes ownership of
 * the layout padding.
 */
export function ResourceCard({
  visual,
  title,
  description,
  actionLabel,
  to,
}: {
  visual?: ReactNode;
  title: string;
  description: ReactNode;
  actionLabel: ReactNode;
  to: string;
}) {
  return (
    <BorderLayout as={Card} padding={2} rowGap={2} hoverable>
      <BorderItem position="north">
        <FlexLayout gap={2} align="start">
          {visual}
          <CardHeading title={title} description={description} headingLevel="h2" scale="card" />
        </FlexLayout>
      </BorderItem>
      <BorderItem position="south">
        <FlexLayout justify="start">
          <LinkButton to={to}>{actionLabel}</LinkButton>
        </FlexLayout>
      </BorderItem>
    </BorderLayout>
  );
}
