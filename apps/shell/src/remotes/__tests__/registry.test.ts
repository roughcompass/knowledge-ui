import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  type Capability,
  type Role,
} from '@knowledge-ui/auth';
import { makeSession } from '@knowledge-ui/testing';
import { describe, expect, it } from 'vitest';

import { REMOTES, remoteFor } from '../registry';

/**
 * The table that decides what the navigation offers.
 *
 * This is the highest-consequence pure module in the host and had no tests. Its
 * whole purpose is that the shell can decide whether to *offer* a destination
 * without downloading the remote that serves it — so a mistake here is not a
 * cosmetic one. It either hides a screen a reader is entitled to, or offers a link
 * that leads to a guaranteed refusal, and the second is worse: the reader believes
 * they should have been able to.
 *
 * The assertions are therefore mostly about the relationship between this table and
 * the capability table, which is the pairing nothing checked.
 */

const ROLES: Role[] = ['admin', 'producer', 'consumer', 'auditor'];

/**
 * Every capability the table references, section and child alike.
 *
 * Typed as the capability union rather than `string`, because the descriptor's own
 * fields are — a child's `need` was deliberately narrowed from `string` so that a
 * typo becomes a compile error instead of a nav entry that silently never appears.
 * Widening it back here would discard that.
 */
function referencedCapabilities(): Capability[] {
  return REMOTES.flatMap((remote) => [
    remote.need,
    ...(remote.children ?? [])
      .map((child) => child.need)
      .filter((need): need is Capability => need !== undefined),
  ]);
}

describe('every destination names a capability that exists', () => {
  it('references only capabilities the table defines', () => {
    /*
     * The failure this prevents is silent by construction. A typo in a capability
     * name produces an entry `can()` can never satisfy, so the destination simply
     * never appears — no error, no warning, just a screen nobody can reach. The
     * descriptor's own type was widened from `string` for this reason; this asserts
     * the property rather than trusting the type to have caught every spelling.
     */
    for (const capability of referencedCapabilities()) {
      expect(ALL_CAPABILITIES, `${capability} is referenced by the nav`).toContain(capability);
    }
  });

  it('references at least one capability per section', () => {
    // A section with no capability would be offered to everyone, including roles
    // the API refuses, which is the exact shape of a guaranteed refusal.
    for (const remote of REMOTES) {
      expect(remote.need, `${remote.name} has no capability`).toBeTruthy();
    }
  });
});

describe('no destination is offered to a role that cannot use it', () => {
  it.each(ROLES)('offers %s only what its capabilities allow', (role) => {
    const session = makeSession({ role, personaKey: role });

    for (const remote of REMOTES) {
      const sectionVisible = can(session, remote.need);

      for (const child of remote.children ?? []) {
        // A child inherits its section's capability unless it names its own.
        const childNeed = child.need ?? remote.need;
        const childVisible = can(session, childNeed);

        if (childVisible) {
          /*
           * The interesting invariant, and the one a reader would hit: a child
           * cannot be reachable through a section its role cannot enter. If a child
           * needs *less* than its section, it is unreachable and the entry is a
           * promise the app cannot keep.
           */
          expect(
            sectionVisible,
            `${remote.name}/${child.path} is visible to ${role} but its section is not`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps the audit log auditor-only, including against an admin', () => {
    /*
     * The worked example of role collapse. The server resolves a principal to one
     * role by precedence with auditor lowest, so a principal holding admin and
     * auditor loses audit access — meaning an admin following an audit link would
     * meet a refusal. Asserted here rather than only in the capability table,
     * because this table is what decides whether the link is drawn.
     */
    const auditChild = REMOTES.flatMap((r) => r.children ?? []).find((c) => c.path === 'audit');
    expect(auditChild?.need).toBe('audit:read');
    expect(can(makeSession({ role: 'admin', personaKey: 'admin' }), 'audit:read')).toBe(false);
    expect(can(makeSession({ role: 'auditor', personaKey: 'auditor' }), 'audit:read')).toBe(true);
  });

  it('gates the usage destination on the scope a producer actually holds', () => {
    /*
     * Usage is two capabilities because the server has two gates, and the nav must
     * use the one that lets a producer in — they are entitled to usage of what they
     * own. Gating the destination on the operator scope would hide the page from the
     * role it was partly built for.
     */
    const usage = REMOTES.flatMap((r) => r.children ?? []).find((c) => c.path === 'usage');
    expect(usage?.need).toBe('usage:read:owned');
    expect(can(makeSession({ role: 'producer', personaKey: 'producer' }), 'usage:read:owned')).toBe(
      true,
    );
    expect(can(makeSession({ role: 'consumer', personaKey: 'consumer' }), 'usage:read:owned')).toBe(
      false,
    );
  });
});

describe('the table is internally consistent', () => {
  it('mounts each remote at a distinct absolute path', () => {
    const paths = REMOTES.map((r) => r.mountPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith('/')).toBe(true);
  });

  it('keeps child paths relative, so a remote can be remounted without a rebuild', () => {
    /*
     * The property that lets the same bundle mount at a different prefix. An
     * absolute child path would bake the mount point into the host's table and
     * silently break a remount.
     */
    for (const remote of REMOTES) {
      for (const child of remote.children ?? []) {
        expect(child.path.startsWith('/'), `${remote.name}/${child.path} is absolute`).toBe(false);
      }
    }
  });

  it('gives every section exactly one index child', () => {
    // The empty path is the section's own route. Two would make the rail ambiguous
    // about which entry is current; none would leave the section landing nowhere.
    for (const remote of REMOTES) {
      const children = remote.children ?? [];
      if (children.length === 0) continue;
      expect(children.filter((c) => c.path === '').length, `${remote.name} index routes`).toBe(1);
    }
  });

  it('labels every destination', () => {
    // An unlabelled entry renders as a blank row in the rail rather than failing.
    for (const remote of REMOTES) {
      expect(remote.label.trim().length).toBeGreaterThan(0);
      for (const child of remote.children ?? []) {
        expect(child.label.trim().length, `${remote.name}/${child.path}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps child paths unique within a section', () => {
    for (const remote of REMOTES) {
      const paths = (remote.children ?? []).map((c) => c.path);
      expect(new Set(paths).size, `${remote.name} has duplicate child paths`).toBe(paths.length);
    }
  });
});

describe('looking a remote up', () => {
  it('returns the descriptor for a known remote', () => {
    expect(remoteFor('catalog').mountPath).toBe('/catalog');
    expect(remoteFor('operations').mountPath).toBe('/ops');
  });

  it('throws rather than returning undefined for an unknown one', () => {
    /*
     * Throwing is the right answer: the caller is the shell's own route table, so an
     * unknown name is a programming error at startup rather than a runtime
     * condition. Returning undefined would defer it to a confusing render.
     */
    expect(() => remoteFor('nope' as never)).toThrow(/no descriptor/i);
  });
});

describe('the capability table has no unreachable entries', () => {
  it('grants every capability to at least one role', () => {
    // A capability nobody holds gates a screen nobody can open, which is a nav
    // entry that can never render rather than a security property.
    for (const capability of ALL_CAPABILITIES) {
      expect(CAPABILITIES[capability].length, `${capability} is held by no role`).toBeGreaterThan(
        0,
      );
    }
  });
});
