import { FlexLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A page-section title, with the one link that belongs beside it.
 *
 * Promoted from the dashboard into the kit because every page needs the same two
 * things and was solving them separately: a section heading that actually outranks
 * the text it governs, and a single right-aligned destination for when the summary
 * is not enough.
 *
 * `styleAs="h3"` (20px), up from the h4/16 the dashboard used — section headings
 * rendered *smaller than body copy's own emphasis*, which is most of why pages read
 * as an undifferentiated wall. The element stays `h2` so the document outline holds.
 *
 * One action, never two. Two makes it a toolbar and the eye stops reading either.
 */
export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <FlexLayout gap={2} align="center" justify="space-between">
      <Text styleAs="h3" as="h2">
        {title}
      </Text>
      {action}
    </FlexLayout>
  );
}
