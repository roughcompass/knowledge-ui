import { describe, expect, it } from 'vitest';

/**
 * The three consumer surfaces share a cache scope and a set of closed
 * vocabularies, so they are asserted together even though they now live in three
 * modules. Splitting this file per module would put the notification-key
 * invalidation assertion out of reach of the root key it depends on.
 */

import { NOTIFICATION_STATUSES } from '../notifications';
import { EVENT_KINDS } from '../subscriptions';
import { queryKeys } from '../keys';
import { PAGE_LIMITS, clampPageSize } from '../params';

const scope = { personaKey: 'consumer', tenantSlug: 'dev' };

describe('consumer query keys', () => {
  it('stay inside the principal scope', () => {
    // Same reasoning as every other key: a key that escaped the scope would
    // survive a persona switch and show one identity's rows to another.
    for (const key of [
      queryKeys.adoption(scope, 'salt-ds'),
      queryKeys.subscriptions(scope, 'salt-ds'),
      queryKeys.notificationsRoot(scope),
      queryKeys.notifications(scope, { status: 'unread' }),
    ]) {
      expect(key.slice(0, 3)).toEqual(['kui', 'consumer', 'dev']);
    }
  });

  it('keys adoption per capability, because the endpoint is per capability', () => {
    expect(queryKeys.adoption(scope, 'a')).not.toEqual(queryKeys.adoption(scope, 'b'));
  });

  it('nests every notification list under the root that mark-read invalidates', () => {
    // The item carries no read flag, so mark-read invalidates the root rather
    // than editing a row. If a status-filtered key were not a child of the
    // root, marking read in the default view would leave the `all` view stale.
    const root = queryKeys.notificationsRoot(scope);
    for (const status of NOTIFICATION_STATUSES) {
      const key = queryKeys.notifications(scope, { status });
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  it('separates notification lists by filter', () => {
    expect(queryKeys.notifications(scope, { status: 'unread' })).not.toEqual(
      queryKeys.notifications(scope, { status: 'all' }),
    );
  });
});

describe('consumer vocabularies', () => {
  it('closes the event kinds', () => {
    // A typo in `event_kinds` is accepted syntactically and then matches
    // nothing, so a subscription that exists and never fires is the failure
    // mode this list exists to prevent.
    expect([...EVENT_KINDS]).toEqual([
      'version_published',
      'breaking_change',
      'lifecycle_changed',
      'deprecated',
    ]);
  });

  it('treats read state as a filter rather than a field', () => {
    expect([...NOTIFICATION_STATUSES]).toEqual(['unread', 'read', 'all']);
  });
});

describe('notification page size', () => {
  it('defaults to the value the API itself defaults to', () => {
    // Matching the server's own default means an unspecified page size produces
    // the same result whether the client sends it or omits it.
    expect(clampPageSize('notifications', undefined)).toBe(50);
    expect(PAGE_LIMITS.notifications.default).toBe(50);
  });

  it('clamps rather than rejects an out-of-range request', () => {
    expect(clampPageSize('notifications', 0)).toBe(PAGE_LIMITS.notifications.min);
    expect(clampPageSize('notifications', 10_000)).toBe(PAGE_LIMITS.notifications.max);
  });
});
