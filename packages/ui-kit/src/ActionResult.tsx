import { Banner, BannerContent, Text } from '@salt-ds/core';

import { ErrorPanel } from './ErrorPanel';

/**
 * The outcome of a write, rendered beside the control that caused it.
 *
 * The write-side mirror of `ErrorPanel`, and deliberately **not** a toast.
 *
 * **Corrected:** an earlier version of this note said Salt ships no Toast, and gave
 * the federation boundary as the main reason a toast was impossible. Both were wrong.
 * Salt's core does export `Toast` and `ToastContent`, and they are *presentational* —
 * no provider, no stacking manager — so the "a context created inside a remote's
 * bundle is a different object from the host's" argument does not apply to them at
 * all. That argument is real, and it is about a notification *system*, which Salt
 * does not provide and this app does not have.
 *
 * The reason for a banner in place is the behavioural one below, which was always the
 * strong half of the argument. Using Salt's floating Toast would also mean writing
 * positioning CSS to place it, which this repo avoids where a Salt component already
 * sits correctly in the flow.
 *
 * Two consequences of rendering in place, both deliberate:
 *
 * **No auto-dismiss.** In an operator console the result is the receipt for an action
 * with a side effect somewhere else. A message that disappears after four seconds is
 * unreadable while the reader is also watching a table refresh, and "did that work?"
 * is then unanswerable without doing it again.
 *
 * **The copy names the effect, not the verb.** "Queued a manual run of docs-corpus",
 * not "Success" — because by the time a reader looks back at the page they may no
 * longer remember which row they pressed.
 */
export function ActionResult({
  success,
  error,
  errorTitle,
}: {
  /** Shown when the write succeeded. Name the effect, not the verb. */
  success?: string;
  /** Whatever the mutation threw. Takes precedence over `success`. */
  error?: unknown;
  errorTitle?: string;
}) {
  if (error !== null && error !== undefined) {
    // Delegated rather than reimplemented: `ErrorPanel` already duck-types the
    // error and surfaces `code · HTTP n` plus `Retry in Ns`, which is exactly what
    // a failed write needs to say.
    return <ErrorPanel error={error} title={errorTitle} />;
  }

  if (success === undefined) return null;

  return (
    // `role="status"` rather than `alert`: a completed action is polite news, and an
    // assertive live region interrupts whatever the reader is doing.
    <Banner status="success" role="status">
      <BannerContent>
        <Text>{success}</Text>
      </BannerContent>
    </Banner>
  );
}
