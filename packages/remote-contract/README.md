# `@knowledge-ui/remote-contract`

The typed handshake between the shell and a federated remote. **Types only.**

Module Federation resolves remotes at runtime, so nothing about a remote's shape
is checked when the host is built. Both sides importing these types is how that
check is recovered: the compiler catches a drift in the mount props even though
the import is dynamic.

## No runtime export, deliberately

This package is not federated. A runtime value here would be duplicated into every
bundle and identity comparisons across the boundary would fail. Its one import is
`import type`, erased at build time.

That makes this the only compile-time guard on the boundary — so a mistake _inside_
these types disables the mechanism rather than merely weakening it. Hence the
type-level test, which fails the typecheck as well as the suite.
