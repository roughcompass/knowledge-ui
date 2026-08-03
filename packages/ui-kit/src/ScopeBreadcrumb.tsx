import { FlexLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A breadcrumb trail. Salt does not have one.
 *
 * `Breadcrumbs` lives in `@salt-ds/lab`, which is alpha with no semver guarantee
 * and is banned by lint. Rather than take the dependency, this composes the
 * pattern from what core does provide: the layout components are polymorphic, so
 * `FlexLayout as="ol"` with `as="li"` items gives a genuine ordered list — the
 * semantics a breadcrumb is supposed to have — without writing raw markup.
 *
 * Segments are plain text or links supplied by the caller. There is no dropdown
 * affordance on any segment, and that is deliberate: a chevron implies the scope
 * can be changed here, and changing tenant means re-resolving the session with a
 * different `X-Tenant-ID` and clearing the query cache. Until that exists, a
 * chevron would be a promise the UI cannot keep.
 */

export interface BreadcrumbSegment {
  key: string;
  /** Rendered as-is, so a caller can pass a router `Link` or plain text. */
  content: ReactNode;
}

export function ScopeBreadcrumb({
  segments,
  label = 'Breadcrumb',
}: {
  segments: readonly BreadcrumbSegment[];
  label?: string;
}) {
  return (
    <FlexLayout as="ol" gap={1} align="center" aria-label={label}>
      {segments.map((segment, index) => (
        <FlexLayout as="li" key={segment.key} gap={1} align="center">
          {/*
            The separator belongs to the segment that follows it, not the one
            before, so the first item has none. Marked aria-hidden because a
            screen reader announces list structure already — reading "slash"
            between every crumb is noise.
          */}
          {index > 0 ? (
            <Text color="secondary" aria-hidden="true">
              /
            </Text>
          ) : null}
          {segment.content}
        </FlexLayout>
      ))}
    </FlexLayout>
  );
}
