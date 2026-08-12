import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  type Capability,
  type Role,
} from '@knowledge-ui/auth';
import { makeSession } from '@knowledge-ui/testing';
import { describe, expect, it } from 'vitest';

import { NAVIGATION, REMOTES, navigationSectionForPath, remoteFor } from '../registry';

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
  return [
    ...REMOTES.map((remote) => remote.need),
    ...NAVIGATION.flatMap((section) => [
      section.need,
      ...section.children
        .map((child) => child.need)
        .filter((need): need is Capability => need !== undefined),
    ]),
  ];
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
    for (const section of NAVIGATION) {
      expect(section.need, `${section.key} has no capability`).toBeTruthy();
    }
  });
});

describe('no destination is offered to a role that cannot use it', () => {
  it.each(ROLES)('offers %s only what its capabilities allow', (role) => {
    const session = makeSession({ role, personaKey: role });

    for (const section of NAVIGATION) {
      const sectionVisible = can(session, section.need);

      for (const child of section.children) {
        // A child inherits its section's capability unless it names its own.
        const childNeed = child.need ?? section.need;
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
            `${section.key}:${child.href} is visible to ${role} but its section is not`,
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
    const auditChild = NAVIGATION.flatMap((section) => section.children).find(
      (child) => child.href === '/ops/audit',
    );
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
    const usage = NAVIGATION.flatMap((section) => section.children).find(
      (child) => child.href === '/ops/usage',
    );
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

  it('gives every navigation section a distinct key', () => {
    const keys = NAVIGATION.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses absolute child links owned by the shell', () => {
    /*
     * Navigation links are host routes, not routes interpreted by a remote. The
     * remote still receives its mount path separately and keeps its own route
     * declarations relative.
     */
    for (const section of NAVIGATION) {
      for (const child of section.children) {
        expect(child.href.startsWith('/'), `${section.key}:${child.href} is relative`).toBe(true);
      }
    }
  });

  it('gives every section exactly one landing child', () => {
    // The section link must open one of its children. Otherwise drilling in would
    // land on a page that the panel cannot mark current.
    for (const section of NAVIGATION) {
      expect(
        section.children.filter((child) => child.href === section.href).length,
        `${section.key} landing routes`,
      ).toBe(1);
    }
  });

  it('labels every destination', () => {
    // An unlabelled entry renders as a blank row in the rail rather than failing.
    for (const remote of REMOTES) {
      expect(remote.label.trim().length).toBeGreaterThan(0);
    }
    for (const section of NAVIGATION) {
      expect(section.label.trim().length).toBeGreaterThan(0);
      for (const child of section.children) {
        expect(child.label.trim().length, `${section.key}:${child.href}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps child links unique within a section', () => {
    for (const section of NAVIGATION) {
      const hrefs = section.children.map((child) => child.href);
      expect(new Set(hrefs).size, `${section.key} has duplicate child links`).toBe(hrefs.length);
    }
  });

  it('places Claims under Catalog without changing its route', () => {
    /*
     * Claims used to be the only child of a section called "Memory". A section
     * with one child asks the reader to open a menu to be told what they were
     * already told, and "Memory" is the system's word for the store rather than
     * anything an application engineer would go looking for. The page kept its
     * route; only where it is reached from changed.
     */
    const containingSections = NAVIGATION.filter((section) =>
      section.children.some((child) => child.label === 'Claims'),
    );

    expect(containingSections).toHaveLength(1);
    expect(containingSections[0]?.key).toBe('catalog');
    expect(containingSections[0]?.children).toContainEqual({
      href: '/catalog/claims',
      label: 'Claims',
      need: 'memory:read',
    });
    expect(navigationSectionForPath('/catalog/claims')?.key).toBe('catalog');
    expect(navigationSectionForPath('/catalog/notifications')?.key).toBe('catalog');
  });

  it('keeps every product area first-class without single-child sections', () => {
    /*
     * Context evaluation became a distinct job once it gained both retrieval
     * probes and receipt inspection. Claims and Workspaces remain catalog views;
     * neither should return as a section that wraps one page.
     */
    expect(NAVIGATION.map((section) => section.label)).toEqual([
      'Catalog',
      'Context Testing',
      'Graph',
      'Operations',
    ]);

    for (const section of NAVIGATION) {
      expect(section.children.length, `${section.key} wraps a single page`).toBeGreaterThan(1);
    }
  });

  it('gives Context Testing a direct section with receipt inspection beside it', () => {
    const context = NAVIGATION.find((section) => section.key === 'context');

    expect(context?.href).toBe('/catalog/context');
    expect(context?.children).toEqual([
      { href: '/catalog/context', label: 'Retrieval Tests' },
      { href: '/catalog/context/receipts', label: 'Receipt Inspector' },
    ]);
    expect(navigationSectionForPath('/catalog/context')?.key).toBe('context');
    expect(
      navigationSectionForPath('/catalog/context/receipts/11111111-1111-4111-8111-111111111111')
        ?.key,
    ).toBe('context');
  });

  it('carries the folded-in capabilities on the children rather than the section', () => {
    // Folding Claims and Workspaces into Catalog must not lower the bar for
    // reaching them, nor raise Catalog's own bar and hide it from a role that
    // may browse.
    const catalog = NAVIGATION.find((section) => section.key === 'catalog');
    const needs = Object.fromEntries(
      (catalog?.children ?? []).map((child) => [child.label, child.need]),
    );

    expect(needs.Claims).toBe('memory:read');
    expect(needs.Workspaces).toBe('workspace:read');
    expect(needs.Capabilities).toBeUndefined();
  });

  it('offers Capabilities as a page of Catalog rather than a section of its own', () => {
    // The section names the area; the child names the page. Promoting the page's
    // name to the section left the rail with no room for anything else the
    // catalog serves.
    const catalog = NAVIGATION.find((section) => section.key === 'catalog');

    expect(catalog?.label).toBe('Catalog');
    expect(catalog?.children).toContainEqual({ href: '/catalog', label: 'Capabilities' });
    expect(NAVIGATION.some((section) => section.label === 'Capabilities')).toBe(false);
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
