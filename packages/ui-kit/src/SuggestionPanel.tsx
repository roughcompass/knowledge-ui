import { Panel, StackLayout, Text, useFloatingComponent, useFloatingUI } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * A field with a panel that floats beneath it.
 *
 * Exists so the global search can preview results using Salt's own floating layer
 * and surface components.
 *
 * Deliberately not a combo box. Salt ships one, and it owns its own list, selection
 * and filtering; here the field submits to a real URL and the panel offers links, so
 * a combo box would have to be fought to stop it behaving like a select.
 *
 * ## The panel is a floating layer, not an absolutely-positioned child
 *
 * It was the latter, and it was invisible for its whole life: the top bar clips its
 * children so a long breadcrumb cannot spill across the search field, and a panel
 * positioned below a field inside that bar is exactly the thing being clipped. The
 * markup was correct, the position was correct, the content was correct, and nothing
 * ever reached the screen — an absolutely-positioned element cannot escape an
 * ancestor's `overflow`, whatever its `z-index` says.
 *
 * So it goes through Salt's own floating layer, which renders outside the shell
 * entirely and is the same machinery behind every Salt dropdown and tooltip. That
 * also buys collision handling: near the viewport edge the panel flips and shifts
 * instead of running off the side, which the hand-positioned version could not do.
 *
 * ## `status`: the panel says what it is doing, not only what it found
 *
 * A panel that only appears when there are links to offer is silent in exactly the
 * three moments a reader needs it: the query is still in flight, it resolved to
 * nothing, or it failed. The caller distinguishes the three — only it holds the
 * query state — and passes one line; it renders as plain secondary text, deliberately
 * not a live region or an option, because the panel is links rather than a listbox
 * and its rows must not claim selection semantics they do not have. The panel opens
 * for a status alone, which is the point: "no matches" is an answer.
 */
export function SuggestionField({
  children,
  panel,
  status,
}: {
  children: ReactNode;
  panel?: ReactNode;
  /**
   * One line about the state of the suggestions themselves: still loading, zero
   * matches, unavailable. Those are three different facts and the caller names
   * which one it is — a spinner where "no matches" is known would be a lie of
   * omission, and "no matches" while the query is still running is a guess.
   */
  status?: ReactNode;
}) {
  const open = panel !== undefined || (status !== undefined && status !== null);
  const { Component: FloatingComponent } = useFloatingComponent();
  const { refs, x, y, strategy, context } = useFloatingUI({
    open,
    placement: 'bottom-start',
  });

  return (
    <StackLayout gap={0} ref={refs.setReference}>
      {children}
      <FloatingComponent
        open={open}
        ref={refs.setFloating}
        position={strategy}
        top={y ?? 0}
        left={x ?? 0}
        aria-hidden={!open}
        focusManagerProps={{ context, initialFocus: -1, returnFocus: false, modal: false }}
      >
        <Panel variant="primary">
          <StackLayout gap={1}>
            {panel}
            {status !== undefined && status !== null ? (
              <Text color="secondary">{status}</Text>
            ) : null}
          </StackLayout>
        </Panel>
      </FloatingComponent>
    </StackLayout>
  );
}
