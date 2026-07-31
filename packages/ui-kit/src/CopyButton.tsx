import { Button, Tooltip } from '@salt-ds/core';
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
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Clipboard unavailable' : `Copy ${value}`;

  return (
    <Tooltip content={tooltip}>
      <Button
        appearance="transparent"
        sentiment={state === 'failed' ? 'caution' : 'neutral'}
        onClick={copy}
        aria-label={ariaLabel ?? `Copy ${value}`}
      >
        {state === 'copied' ? 'Copied' : label}
      </Button>
    </Tooltip>
  );
}
