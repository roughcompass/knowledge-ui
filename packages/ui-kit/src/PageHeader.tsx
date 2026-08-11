import { FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { Prose } from './Layout';

/**
 * The title block every screen opens with.
 *
 * Exists so headings are consistent and so no screen reaches for a raw <h1>:
 * Salt's Text carries the type scale, and a bare heading element would render
 * outside it.
 *
 * The title keeps `h1` semantics at Salt's `h2` visual scale. In a data-dense
 * console the larger display scale crowded out filters and tables; the smaller
 * scale remains unmistakably first in the outline when paired with the domain
 * eyebrow. The description stays secondary body text rather than competing with it.
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
    <StackLayout gap={2}>
      {eyebrow !== undefined ? (
        <Text styleAs="notation" color="secondary">
          {eyebrow}
        </Text>
      ) : null}
      <FlexLayout gap={2} align="center" justify="space-between">
        <Text styleAs="h2" as="h1">
          {title}
        </Text>
        {actions}
      </FlexLayout>
      {description !== undefined ? (
        // Measured, because several callers pass a full sentence of explanation and
        // it otherwise ran the width of the viewport.
        <Prose>
          <Text color="secondary">{description}</Text>
        </Prose>
      ) : null}
      {metadata}
    </StackLayout>
  );
}
