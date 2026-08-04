import { Banner, BannerActions, BannerContent, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * Inline contextual feedback, beside the thing it describes.
 *
 * ## Built on Salt's Banner, with no markup or stylesheet of its own
 *
 * The first version of this was a hand-rolled `div` with a CSS module — a left
 * border, four colour variants, its own padding — to get the leading-rule look the
 * reference uses for a margin note. That was the wrong trade. Salt already ships
 * this component: `status` carries exactly the four states, `variant` carries
 * emphasis, and `BannerActions` is the action slot. Reproducing it in custom CSS
 * bought an appearance and gave up the accessibility, keyboard and theming work Salt
 * maintains — and put a second idiom for "tell the reader something" into a repo
 * whose whole design standard is about not having those.
 *
 * So this is composition, not construction. It contributes the *copy discipline* and
 * the two structural constraints below; everything visual is Salt's.
 *
 * ## When this and not one of the two neighbours
 *
 * There are three ways to tell a reader something and the difference is
 * load-bearing. Reaching for the wrong one is how a console acquires a second idiom.
 *
 * - **`Note`** — a caveat, a consequence, or a passed check *about the panel it sits
 *   in*. It qualifies data the reader is looking at. Secondary emphasis, because it
 *   annotates rather than interrupts.
 * - **`UnavailableNotice`** — the data does not exist to fetch. Primary emphasis: it
 *   is a statement about the surface, not about a value on it.
 * - **`EmptyState`** — the query ran and found nothing. It will fill when data
 *   arrives; the other two will not.
 *
 * ## Persistent, by construction
 *
 * There is no dismiss prop and there will not be one. A note stays until the state
 * it describes changes, and a dismiss control competes with the message — the reader
 * closes it to clear the screen and the caveat is gone while the caveat still
 * applies. Where a caveat is uniform across every row of something, it belongs here
 * once rather than on each row, because an identical marker repeated becomes chrome
 * the eye stops seeing.
 *
 * ## One action, at most
 *
 * `action` is a single slot rather than children. Two buttons in a note make it a
 * decision point, and a note is not where a decision belongs — that is a dialog or a
 * form.
 *
 * ## Copy
 *
 * `label` is one or two words in Title Case naming the topic — "Cached Result",
 * "Retention Limit" — and `children` is one active-voice sentence about the
 * consequence. Neither is enforceable, and both are the difference between a note
 * that gets read and one that gets skipped. No "Heads up", no "FYI": a note that
 * opens by announcing that it is a note has spent its first line saying nothing.
 */
export function Note({
  label,
  variant = 'neutral',
  action,
  children,
}: {
  /** One or two words, Title Case, naming the topic rather than the feeling. */
  label: string;
  /**
   * Chosen by meaning, never by colour:
   *
   * - `error` — a problem the reader must fix.
   * - `warning` — a consequence to acknowledge. Most data caveats are this.
   * - `success` — a check that passed, worth confirming.
   * - `neutral` — context that is neither good nor bad. The default, and the right
   *   choice for "here is what this number does not say".
   *
   * Maps onto Salt's `status`, with `neutral` becoming `info` — Salt has no neutral
   * state, and info is the one that does not imply something needs attention.
   */
  variant?: 'neutral' | 'success' | 'warning' | 'error';
  /** A single route onward. Deliberately not a list. */
  action?: ReactNode;
  /** One active-voice sentence about the consequence. */
  children: ReactNode;
}) {
  return (
    <Banner status={variant === 'neutral' ? 'info' : variant} variant="secondary">
      <BannerContent>
        <StackLayout gap={0.5}>
          <Text styleAs="label">{label}</Text>
          <Text>{children}</Text>
        </StackLayout>
      </BannerContent>
      {action !== undefined ? <BannerActions>{action}</BannerActions> : null}
    </Banner>
  );
}
