import { Button, FlexLayout, Text } from '@salt-ds/core';

/**
 * Prev/Next for keyset pagination.
 *
 * There is deliberately no page number and no "page 3 of 12". The list endpoints
 * return `items` and `next_cursor` and no total, so a page count would have to
 * be invented — and a count that is wrong is worse than a count that is absent,
 * because a reader will act on it. "Showing N" is what the response actually
 * supports.
 *
 * Prev works off a client-side stack of cursors already visited, since the
 * server only ever hands out forward links.
 */
export function CursorPager({
  canPrev,
  canNext,
  onPrev,
  onNext,
  showingCount,
  isLoading = false,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  showingCount: number;
  isLoading?: boolean;
}) {
  return (
    <FlexLayout justify="space-between" align="center" gap={2}>
      <Text color="secondary" styleAs="notation">
        Showing {showingCount} {showingCount === 1 ? 'row' : 'rows'}
      </Text>
      <FlexLayout gap={1}>
        <Button
          appearance="bordered"
          sentiment="neutral"
          disabled={!canPrev || isLoading}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          appearance="bordered"
          sentiment="neutral"
          disabled={!canNext || isLoading}
          onClick={onNext}
        >
          Next
        </Button>
      </FlexLayout>
    </FlexLayout>
  );
}
