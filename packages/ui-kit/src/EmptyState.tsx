import { Card, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * Shown when a request succeeded and returned nothing.
 *
 * Distinct from an error on purpose: "no results" and "the request failed" are
 * different facts, and collapsing them sends people looking for a bug that is
 * not there.
 *
 * Centring comes from the layout component rather than a text-align rule, which
 * keeps this free of a stylesheet.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <StackLayout gap={1} align="center">
        <Text styleAs="h4">{title}</Text>
        {description ? <Text color="secondary">{description}</Text> : null}
        {action}
      </StackLayout>
    </Card>
  );
}
