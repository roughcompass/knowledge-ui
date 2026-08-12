import { FlexItem, FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { Prose } from './Layout';

/**
 * The title block every screen opens with.
 *
 * Exists so headings are consistent and so no screen reaches for a raw <h1>:
 * Salt's Text carries the type scale, and a bare heading element would render
 * outside it.
 *
 * The title keeps `h1` semantics and Salt's `h1` visual scale, matching the
 * page-heading hierarchy used by the reference shell. The description stays
 * secondary body text rather than competing with it.
 *
 * `description` and `metadata` are separate props rather than one polymorphic slot.
 * There was one slot, branching on `typeof description === 'string'` to decide
 * whether to apply a prose measure — and it was wrong in both directions. A caller
 * passing a sentence *with emphasis* got a fragment, so it skipped the wrapper and
 * `StackLayout`'s flex column turned each of its four children into its own line:
 * "Tenant", then the tenant name, then "· role", then the role. A caller passing a
 * row of `Tag`s got the wrapper and had its chips squeezed into a 68ch measure meant
 * for running text.
 *
 * The real distinction is what the content *is*, so the props say so:
 *
 *   description  running text. Always measured, always secondary, always inline.
 *   metadata     chips, status, counts. Laid out by the caller, no measure.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  metadata,
  actions,
}: {
  /** Short context label above the page title. */
  eyebrow?: ReactNode;
  title: string;
  /** A sentence. Emphasis is fine; block-level children are not. */
  description?: ReactNode;
  /** A row of `Tag`s or similar, rendered exactly as given. */
  metadata?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <FlexLayout gap={3} align="end" justify="space-between" wrap>
      <FlexItem basis={{ xs: '100%', sm: 0 }} grow={1} shrink={1}>
        <StackLayout gap={2}>
          {eyebrow !== undefined ? (
            <Text styleAs="notation" color="secondary">
              {eyebrow}
            </Text>
          ) : null}
          <Text styleAs="h1" as="h1">
            {title}
          </Text>
          {description !== undefined ? (
            // Measured, because several callers pass a full sentence of explanation and
            // it otherwise ran the width of the viewport.
            <Prose>
              <Text color="secondary">{description}</Text>
            </Prose>
          ) : null}
          {metadata}
        </StackLayout>
      </FlexItem>
      {actions !== undefined ? (
        <FlexLayout gap={2} align="center" wrap>
          {actions}
        </FlexLayout>
      ) : null}
    </FlexLayout>
  );
}
