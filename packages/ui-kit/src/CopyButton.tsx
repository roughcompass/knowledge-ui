import { Button, Tooltip } from '@salt-ds/core';
import { CopyIcon, SuccessTickIcon } from '@salt-ds/icons';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy a value to the clipboard, with transient confirmation.
 *
 * Worth a component because of what it is used for: the audit log's request id
 * is the single value that makes a backend investigation fast, and asking
 * someone to select a monospace UUID by hand is where that stops happening.
 *
 * The clipboard API is unavailable over plain HTTP on a non-localhost origin, so
 * failure is expected rather than exceptional — the button reports it instead of
 * throwing.
 */
export function CopyButton({
  value,
  label = 'Copy',
  'aria-label': ariaLabel,
}: {
  value: string;
  /**
   * The verb, used for the tooltip and the accessible name.
   *
   * Not rendered as visible text any more. It used to be, and the label swapped
   * to "Copied" on success — which changed the button's width and reflowed the
   * table column it lives in, every time someone copied a request id. An icon
   * that swaps to a tick keeps the geometry fixed.
   */
  label?: string;
  'aria-label'?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clearing on unmount matters here: the row this button sits in is often
  // removed by a page change while the confirmation is still showing.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }, [value]);

  const tooltip =
    state === 'copied'
      ? 'Copied'
      : state === 'failed'
        ? 'Clipboard unavailable'
        : `${label} ${value}`;

  return (
    <Tooltip content={tooltip}>
      <Button
        appearance="transparent"
        sentiment={state === 'failed' ? 'caution' : 'neutral'}
        // `copy` is async and `onClick` expects nothing back. Discarding the
        // promise explicitly is the difference between a rejection that is
        // handled and one that is merely unobserved — `copy` catches the
        // clipboard failure itself, so there is nothing left to await, and
        // `void` records that rather than leaving it to be inferred.
        onClick={() => void copy()}
        aria-label={ariaLabel ?? `${label} ${value}`}
      >
        {state === 'copied' ? <SuccessTickIcon aria-hidden /> : <CopyIcon aria-hidden />}
      </Button>
    </Tooltip>
  );
}
