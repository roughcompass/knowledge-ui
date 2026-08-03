import { Banner, BannerContent, Text } from '@salt-ds/core';

import { ErrorPanel } from './ErrorPanel';

/**
 * The outcome of a write, rendered beside the control that caused it.
 *
 * The write-side mirror of `ErrorPanel`, and deliberately **not** a toast.
 *
 * A toast is the obvious shape and it cannot be built here. `@knowledge-ui/ui-kit`
 * is not a federation share — it sits in each remote's `optimizeDeps.exclude` and is
 * bundled into the remote — so a React context created by a `ToastProvider` inside a
 * remote's bundle is a different object from the host's. A toast fired from a remote
 * page would mount into a region the host never sees. Doing it properly means
 * promoting ui-kit to a shared module, which is a large change to buy a notification
 * for two pages. (Salt 1.67 also ships no Toast, and `@salt-ds/lab` is banned, but
 * that is the smaller reason.)
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
