# Add a screen

Most new surfaces are a page in an existing remote. That is the cheap path and
usually the right one — see [`02-add-a-remote.md`](02-add-a-remote.md) for why a new
remote is not free.

## 1. A client module for the domain

`packages/api-client/src/<domain>.ts`. One module per API domain, not per screen: a
new domain gets its own file rather than joining the nearest one, which is how two
modules previously ended up holding eight domains between them.

Add the query keys to `keys.ts`. Key on **everything that changes the answer**, not
just the resource id — a key holding only the root will serve a depth-1 result
under a depth-3 heading, which is wrong in a way that looks right.

Export from `index.ts` in the domain block, by name. No star exports.

## 2. Request mocks

`packages/testing/src/msw/`. Two rules:

**A fixture must never be richer than the endpoint it stands for.** A field the API
omits lets a component depend on something that will not be there.

**Encode the server's invariants.** Where the API guarantees something, the fixture
should too, so a component cannot pass by being right for the wrong reason. Where
the behaviour under test is "does the UI re-read from the server", the handler must
be stateful — a fixed handler passes for a component that merely guessed.

## 3. The page or panel

In the remote, composed from the ui-kit. Do not reach past it to Salt directly: the
kit carries the corrections that make screens match each other.

Ask a capability, never a role. Add the capability to the table with the gate it
mirrors; a test checks it against the API document.

Distinguish your empty states. "Nothing here", "nothing you can see", "excluded by
your own filter" and "the query failed" call for different actions, and rendering
the same panel for all four is a defect.

## 4. Route and destination

A route in the remote's federated entry, and — if it is a destination rather than a
panel — an entry in `apps/shell/src/remotes/registry.ts` with its capability.

## 5. Tests, and the accessibility gate

Component tests in `__tests__` beside the code, rendered through
`renderWithProviders` so they get the same provider stack as the app.

Assert the properties that make the screen trustworthy rather than that it renders:
that a caveat appears, that a filter reaches the server, that an empty state says
which kind of empty it is.

Add the route to the list in `e2e/specs/a11y.spec.ts`. Every route is checked in
light and dark mode.

## 6. Verify

```bash
npm run ci
```

The bundle budget is the one people forget. If the new surface moved it, that is
information, not an obstacle.
