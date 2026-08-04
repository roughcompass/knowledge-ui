import { describe, expectTypeOf, it } from 'vitest';
import type { ComponentType } from 'react';

import type { RemoteApp, RemoteMountProps, RemoteName } from '../index';

/**
 * The type-level test this package's docstring already claimed to have.
 *
 * It did not exist, and the claim mattered more here than it would elsewhere: this
 * package is the only check on a boundary the compiler otherwise cannot see.
 * Module Federation resolves a remote at runtime, so if the host passes props a
 * remote does not accept, nothing fails until a reader opens the page. Both sides
 * importing these types is what recovers the check — and a mistake *inside* these
 * types therefore breaks the one mechanism the boundary has.
 *
 * Assertions are type-level rather than value-level because there is nothing to
 * assert at runtime: the package deliberately exports no runtime value, since one
 * would be duplicated into every bundle and identity comparisons across the
 * boundary would then fail. `expectTypeOf` is checked by `tsc`, so these fail the
 * typecheck as well as the suite.
 */
describe('the host-to-remote mount contract', () => {
  it('is a component type over the mount props', () => {
    expectTypeOf<RemoteApp>().toEqualTypeOf<ComponentType<RemoteMountProps>>();
  });

  it('threads the session and client types through to the props', () => {
    /*
     * The generics are the reason this package can stay dependency-free of the
     * session and client packages while still being type-safe: the host supplies
     * the concrete types at the mount site. If they stopped propagating, every
     * remote would silently widen to `unknown` and the boundary check would be
     * vacuous while still compiling.
     */
    interface TestSession {
      role: 'admin';
    }
    interface TestClient {
      request: () => Promise<void>;
    }

    expectTypeOf<RemoteApp<TestSession, TestClient>>().toEqualTypeOf<
      ComponentType<RemoteMountProps<TestSession, TestClient>>
    >();
    expectTypeOf<RemoteMountProps<TestSession, TestClient>>()
      .toHaveProperty('session')
      .toEqualTypeOf<TestSession>();
    expectTypeOf<RemoteMountProps<TestSession, TestClient>>()
      .toHaveProperty('client')
      .toEqualTypeOf<TestClient>();
  });

  it('defaults both to unknown rather than any', () => {
    // `any` here would make the whole contract unenforceable while still passing
    // every other assertion in this file, which is why it is asserted directly.
    expectTypeOf<RemoteMountProps>().toHaveProperty('session').toEqualTypeOf<unknown>();
    expectTypeOf<RemoteMountProps>().toHaveProperty('client').toEqualTypeOf<unknown>();
  });

  it('keeps the persona switcher optional and the roster required', () => {
    /*
     * The asymmetry is the contract: a production build has no switcher, so the
     * callback is absent — but the roster is still passed, empty, because a
     * refused route explains which role would work whether or not it can offer
     * the switch. Making the roster optional would let a host omit it and leave
     * that explanation with nothing to name.
     */
    expectTypeOf<RemoteMountProps>().toHaveProperty('personas').not.toBeUndefined();
    expectTypeOf<RemoteMountProps>()
      .toHaveProperty('onSwitchPersona')
      .extract<undefined>()
      .not.toBeNever();
  });

  it('names exactly the remotes the shell can mount', () => {
    expectTypeOf<RemoteName>().toEqualTypeOf<'catalog' | 'operations'>();
  });
});
