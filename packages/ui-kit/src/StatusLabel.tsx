import { FlexLayout, StatusIndicator, Text } from '@salt-ds/core';
import type { ComponentProps, ReactNode } from 'react';

/**
 * A compact state readout: Salt's semantic indicator, followed by its label.
 *
 * A `Tag` classifies something; it does not report whether that thing succeeded,
 * failed, is still running, or needs attention. Keeping state in this shape gives
 * it an icon as well as colour and leaves category pills for actual categories.
 */
export function StatusLabel({
  status,
  children,
}: {
  status: ComponentProps<typeof StatusIndicator>['status'];
  children: ReactNode;
}) {
  return (
    <FlexLayout gap={1} align="center">
      <StatusIndicator status={status} />
      <Text styleAs="notation">{children}</Text>
    </FlexLayout>
  );
}
