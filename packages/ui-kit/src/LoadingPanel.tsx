import { FlexLayout, Spinner, StackLayout, Text } from '@salt-ds/core';

/**
 * The single loading affordance.
 *
 * One spinner rather than per-screen skeletons: a skeleton has to mirror the
 * shape of the content to be worth anything, and a mirror that drifts is worse
 * than an honest spinner. The label is announced, so a screen reader is told
 * something is happening rather than being handed silence.
 */
export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <FlexLayout justify="center" align="center" padding={4}>
      <StackLayout gap={1} align="center" role="status" aria-live="polite">
        <Spinner size="medium" aria-label={label} />
        <Text color="secondary">{label}</Text>
      </StackLayout>
    </FlexLayout>
  );
}
