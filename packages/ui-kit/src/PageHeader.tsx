import { FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * The title block every screen opens with.
 *
 * Exists so headings are consistent and so no screen reaches for a raw <h1>:
 * Salt's Text carries the type scale, and a bare heading element would render
 * outside it.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StackLayout gap={1}>
      <FlexLayout gap={2} align="center" justify="space-between">
        <Text styleAs="h2" as="h1">
          {title}
        </Text>
        {actions}
      </FlexLayout>
      {description ? <Text color="secondary">{description}</Text> : null}
    </StackLayout>
  );
}
