import { FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { Prose } from './Layout';
import styles from './PageHeader.module.css';

/**
 * The title block every screen opens with.
 *
 * Exists so headings are consistent and so no screen reaches for a raw <h1>:
 * Salt's Text carries the type scale, and a bare heading element would render
 * outside it.
 *
 * The title is a full `h1` at 32px/42px. It was `styleAs="h2"` (24px) on a reading
 * of the reference that turned out too quiet in practice: with body at 14px and
 * every card title compressed, the whole page flattened and a user audit called the
 * hierarchy inverted. The description is promoted with it — a page's one-sentence
 * purpose is not fine print.
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
  title,
  description,
  metadata,
  actions,
}: {
  title: string;
  /** A sentence. Emphasis is fine; block-level children are not. */
  description?: ReactNode;
  /** A row of `Tag`s or similar, rendered exactly as given. */
  metadata?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StackLayout gap={1}>
      <FlexLayout gap={2} align="center" justify="space-between">
        <Text className={styles.title} styleAs="h1" as="h1">
          {title}
        </Text>
        {actions}
      </FlexLayout>
      {description !== undefined ? (
        // Measured, because several callers pass a full sentence of explanation and
        // it otherwise ran the width of the viewport.
        <Prose>
          <Text className={styles.description} styleAs="h4" as="p" color="secondary">
            {description}
          </Text>
        </Prose>
      ) : null}
      {metadata}
    </StackLayout>
  );
}
