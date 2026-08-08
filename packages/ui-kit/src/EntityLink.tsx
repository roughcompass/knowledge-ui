import { FlexLayout, Text, Tooltip } from '@salt-ds/core';

import { CopyButton } from './CopyButton';
import { KLink } from './LinkAdapter';

/**
 * A reference to something else in the contextplane.
 *
 * Nine surfaces rendered a bare thirty-six-character UUID as their entire answer to
 * "which one" — the impact panel's related-entity column, every claim's subject, the
 * usage tables, the audit log's target, a workspace entry's references. Those are the
 * places a reader is most likely to want to go next, and none of them went anywhere.
 * A reader could not tell two rows apart, could not click through, and could not
 * search for the thing they were looking at.
 *
 * Three renderings, in order of what the caller knows:
 *
 * 1. **A name and a destination** — a link, which is the answer wherever it is
 *    available.
 * 2. **A name and no destination** — the name as text. Some references genuinely have
 *    no page yet; showing the name is still strictly better than showing the id.
 * 3. **Neither** — the first eight characters in the code face, with the full id in a
 *    tooltip and a copy control beside it. Not a truncation for its own sake: eight
 *    characters is enough to tell two rows apart at a glance, which the full id is
 *    not, and the whole value stays one keystroke away for anyone who needs to paste
 *    it into a support ticket.
 *
 * **An id that will not resolve stays an id, and says why.** Cross-tenant edges are
 * real — the impact panel's own empty state argues this — so a reference the caller
 * cannot read is not an error and must not be rendered as one. Pass `unresolved` and
 * the tooltip says so rather than leaving a reader to wonder whether the name failed
 * to load.
 *
 * Prefer passing a `name` the server already sent. Several endpoints carry one — the
 * graph projection builds a name map from its own node list, search hits and usage
 * rows include names — and a resolver that fires when the answer was already in the
 * response is a request nobody needed.
 */
export function EntityLink({
  id,
  name,
  to,
  unresolved = false,
}: {
  id: string;
  /** The display name, when the caller already has one. */
  name?: string;
  /** Where this reference goes. Omit when no page exists for it yet. */
  to?: string;
  /** The id could not be resolved — not visible to this tenant, or since removed. */
  unresolved?: boolean;
}) {
  if (name) {
    return to ? (
      <KLink to={to} underline="never" color="accent">
        {name}
      </KLink>
    ) : (
      <Text>{name}</Text>
    );
  }

  /*
   * Only an opaque id is shortened.
   *
   * Registry references are not uniformly UUIDs — a capability's handle is its slug,
   * and `salt-design-system` is already the most readable thing this component could
   * render. Truncating by length alone turned that into `salt-des`, which is strictly
   * worse than what it replaced. So the rule is shape, not length: a UUID carries no
   * information in its first eight characters beyond telling two rows apart, and
   * anything else is left whole because it may well be the name.
   */
  const opaque = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (!opaque) {
    return to ? (
      <KLink to={to} underline="never" color="accent">
        {id}
      </KLink>
    ) : (
      <Text>{id}</Text>
    );
  }

  const short = id.slice(0, 8);
  const label = unresolved ? `${id} — not visible to this tenant` : id;

  return (
    <FlexLayout gap={1} align="center">
      <Tooltip content={label}>
        {to ? (
          <KLink to={to} underline="never" color="accent" styleAs="code">
            {short}
          </KLink>
        ) : (
          <Text styleAs="code" color="secondary">
            {short}
          </Text>
        )}
      </Tooltip>
      <CopyButton value={id} label="Copy Id" />
    </FlexLayout>
  );
}
