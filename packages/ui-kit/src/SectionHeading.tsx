import { FlexItem, FlexLayout, StackLayout, Text } from '@salt-ds/core';
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
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  headingLevel = 'h2',
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Set to `h3` when this group sits beneath another section heading. */
  headingLevel?: 'h2' | 'h3';
}) {
  return (
    <FlexLayout gap={2} align="start" justify="space-between" wrap>
      <FlexItem basis={{ xs: '100%', sm: 0 }} grow={1} shrink={1}>
        <StackLayout gap={1}>
          {eyebrow ? (
            <Text styleAs="notation" color="secondary">
              {eyebrow}
            </Text>
          ) : null}
          <Text styleAs="h3" as={headingLevel}>
            {title}
          </Text>
          {description !== undefined ? <Text color="secondary">{description}</Text> : null}
        </StackLayout>
      </FlexItem>
      {action !== undefined ? <FlexItem shrink={0}>{action}</FlexItem> : null}
    </FlexLayout>
  );
}
