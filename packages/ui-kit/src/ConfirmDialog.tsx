import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogHeader,
  Spinner,
  StackLayout,
} from '@salt-ds/core';
import type { ReactNode } from 'react';

import styles from './ConfirmDialog.module.css';

import { ActionResult } from './ActionResult';

/**
 * Confirmation for an action with a consequence.
 *
 * The repo had no controlled-dialog precedent to copy. Its one `Dialog` — the tenant
 * picker in the session bootstrap — is `<Dialog open>` with no close path at all,
 * because it is a gate rather than a decision: there is no "cancel" for "which tenant
 * are you". So this is the first dialog here that can be dismissed.
 *
 * The load-bearing rule is where the error goes. **This dialog owns the mutation's
 * error while it is open, and closes only on success.** Closing on click and
 * surfacing the failure back on the page puts the message where the reader has
 * already stopped looking — and worse, it reads as though the action succeeded. So
 * `onConfirm` does not close anything; the caller closes when its mutation resolves.
 *
 * Correspondingly `busy` disables both buttons rather than just the confirm. Letting
 * Cancel through mid-flight would leave a request in the air with its result routed
 * to a dialog that no longer exists.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  /** Names the action, not the assent — "Deactivate", never "OK". */
  confirmLabel: string;
  /** In flight. Disables both actions and shows a spinner on the confirm. */
  busy?: boolean;
  /** The failed mutation's error. Rendered inside the dialog, by design. */
  error?: unknown;
  onCancel: () => void;
  /** Starts the work. Must NOT close the dialog — the caller closes on success. */
  onConfirm: () => void;
  /** What is about to happen, and what it does not do. */
  children: ReactNode;
}) {
  return (
    <Dialog
      className={styles.dialog}
      open={open}
      onOpenChange={(next) => {
        // Escape and click-away route through here. Both are a cancel, and neither
        // is allowed to abandon a request already in flight.
        if (!next && !busy) onCancel();
      }}
      // A dismissal mid-flight would orphan the response. The explicit guard above
      // handles the keyboard and scrim; this stops the click-away path entirely.
      disableDismiss={busy}
      size="small"
    >
      <DialogHeader header={title} />
      <DialogContent>
        <StackLayout gap={2}>
          {children}
          <ActionResult error={error} errorTitle="That did not work" />
        </StackLayout>
      </DialogContent>
      <DialogActions>
        <Button appearance="transparent" sentiment="neutral" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button appearance="solid" sentiment="accented" disabled={busy} onClick={onConfirm}>
          {busy ? <Spinner size="small" aria-label="Working" /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
