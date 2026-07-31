import { StackLayout, Text } from '@salt-ds/core';

import styles from './JsonDiff.module.css';

/**
 * Key-level before/after comparison for an audit entry.
 *
 * The audit log stores a JSON snapshot on each side of a change. Rendering both
 * blobs side by side leaves the reader diffing by eye, which is the whole
 * question they came to answer — so this marks which keys moved.
 *
 * Shallow on purpose. A deep structural diff is a much larger component and the
 * audit payloads are flat records of column changes; going deeper would add
 * complexity for a shape that does not occur.
 */

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
  status: DiffStatus;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Compare two snapshots key by key.
 *
 * Both sides being absent is normal rather than exceptional: a create has no
 * before and a delete has no after, so a missing side means "this key did not
 * exist then", not "we failed to load it".
 */
export function diffKeys(before: unknown, after: unknown): DiffEntry[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].sort();

  return keys.map((key) => {
    const hasBefore = b !== null && key in b;
    const hasAfter = a !== null && key in a;
    const beforeValue = hasBefore ? b[key] : undefined;
    const afterValue = hasAfter ? a[key] : undefined;

    let status: DiffStatus;
    if (!hasBefore && hasAfter) status = 'added';
    else if (hasBefore && !hasAfter) status = 'removed';
    // Compared by serialisation rather than identity: the values arrive freshly
    // parsed from JSON, so reference equality is never true for objects.
    else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) status = 'changed';
    else status = 'unchanged';

    return { key, before: beforeValue, after: afterValue, status };
  });
}

function render(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function JsonDiff({
  before,
  after,
  hideUnchanged = false,
}: {
  before: unknown;
  after: unknown;
  hideUnchanged?: boolean;
}) {
  const all = diffKeys(before, after);
  const entries = hideUnchanged ? all.filter((e) => e.status !== 'unchanged') : all;

  if (entries.length === 0) {
    return (
      <Text color="secondary" styleAs="notation">
        {all.length === 0 ? 'no snapshot recorded' : 'no keys changed'}
      </Text>
    );
  }

  return (
    <StackLayout gap={1}>
      <div className={styles.grid}>
        <Text styleAs="label" color="secondary">
          Before
        </Text>
        <Text styleAs="label" color="secondary">
          After
        </Text>
      </div>
      {entries.map((entry) => (
        <div key={entry.key} className={styles.grid}>
          <div className={`${styles.row} ${styles[entry.status] ?? ''}`}>
            <Text styleAs="notation" color="secondary">
              {entry.key}
            </Text>
            <Text className={styles.value}>{render(entry.before)}</Text>
          </div>
          <div className={`${styles.row} ${styles[entry.status] ?? ''}`}>
            <Text styleAs="notation" color="secondary">
              {entry.key}
            </Text>
            <Text className={styles.value}>{render(entry.after)}</Text>
          </div>
        </div>
      ))}
    </StackLayout>
  );
}
