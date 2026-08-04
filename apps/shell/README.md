# `@knowledge-ui/shell`

The host. Owns identity, navigation, routing, and the API client.

## Why the host owns the client

A remote constructing its own would carry its own token, retry policy and base
URL — three things that must agree across the app and cannot be checked at build
time, because federation resolves remotes at runtime. They travel down as props
instead, so the compiler checks the shape.

One client per app instance, never a module singleton. A dual-mount test asserts
it, because two mounted instances must not share a token.

## Why the host owns the nav

`src/remotes/registry.ts` declares each remote's label, mount path, required
capability and child pages. The shell can therefore decide whether to _offer_ a
destination without downloading the remote that serves it — the alternative is
fetching a bundle to discover whether the reader may see the link to it.

A child page may need a _different_ capability than its section, in both
directions: the audit log needs more than the operations section, and the sync
screens need more again.

## Session bootstrap

`src/session/SessionBootstrap.tsx` turns an identity into a session, with a branch
for each way it fails: a tenant that must be chosen, credentials that need
refreshing once, and an unseeded principal — which returns a bare refusal that
looks exactly like a permission problem, so the screen names the seeding command.

An unrecognised role throws rather than being guessed at.
