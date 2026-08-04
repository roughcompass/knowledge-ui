# Orientation

This app is the human-readable face of a governed, multi-tenant memory of what a
platform ships. The registry holds capabilities, their interfaces, their owners,
their dependencies, and claims about them carrying provenance and confidence. This
is where a person reads that memory and acts on it.

Four audiences, and the screens exist for them rather than for the data model:

| Reader               | What they came for                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Consuming team**   | What exists, what its contract is, whether it is safe to build on, and telling the owner they depend on it |
| **Capability owner** | Who depends on what they own, so they know what a change would break                                       |
| **Memory steward**   | Whether what is served is current and trusted, and which claims lack evidence                              |
| **Operator**         | Whether the service is healthy, and whether anything is silently dropping                                  |

## The shape

A host shell owns identity, navigation, routing and the API client. Federated
remotes own their screens and nothing else.

The reason the host owns the client: a remote constructing its own would carry its
own token, its own retry policy and its own base URL — three things that must agree
across the app and cannot be checked at build time, because federation resolves
remotes at runtime. Passing them down as props makes the compiler check the shape
even though the import is dynamic.

The reason the host owns the nav: it can then decide whether to _offer_ a
destination without downloading the remote that serves it. The alternative is
fetching a bundle to discover whether the reader is allowed to see the link to it.

## Where things live

| Path                       | Owns                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `apps/shell`               | session bootstrap, the rail and top bar, the remote registry, error boundaries       |
| `remotes/catalog`          | capability browse and detail, impact, adoption, subscriptions, notifications, claims |
| `remotes/operations`       | health, operational health, the audit log, sync connectors and runs                  |
| `packages/remote-contract` | the typed host-to-remote handshake. Types only                                       |
| `packages/auth`            | session, roles, the capability table, the dev persona roster                         |
| `packages/api-client`      | the generated client, query keys, one module per API domain                          |
| `packages/ui-kit`          | every shared component. The only workspace with stylesheets                          |
| `packages/testing`         | request mocks, fixtures, render helpers                                              |
| `tooling/`                 | the federation share contract, the dev and preview proxy                             |

## Data access

One generated client per app instance, never a module singleton — asserted by a
dual-mount test, because two mounted instances must not share a token.

Query keys are namespaced by principal: `['kui', persona, tenant, …]`. A persona
switch clears the cache, but the prefix means even a missed clear cannot show one
identity's rows to another. That is the one caching bug worth designing against
rather than testing for, and it matters most on claims, whose visibility is decided
per entity.

Where a resource has no read flag of its own — notifications are the case — state is
a query filter, and a mutation invalidates a _root_ key so every filtered view
refetches. Editing the cached row instead would desynchronise from a server that may
have changed it by another route.

## Next

- Running it, and what has to be running: [`../../README.md`](../../README.md)
- Adding a screen: [`../03-guides/01-add-a-screen.md`](../03-guides/01-add-a-screen.md)
- The rules that are enforced: [`../../CLAUDE.md`](../../CLAUDE.md)
