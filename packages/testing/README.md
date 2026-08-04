# `@knowledge-ui/testing`

Request mocks, fixtures, and the render helper.

## Three entry points, on purpose

- `.` — environment-neutral: fixtures, handlers, `renderWithProviders`.
- `./server` — the Node interceptor, for component tests.
- `./browser` — the service worker, for the mocked end-to-end lane.

The two request entries are **not** re-exported from the barrel: the Node one
reaches for `async_hooks`, so a browser bundle following the barrel fails to build
even if it only wanted the worker.

## Fixture rules

**Never richer than the endpoint it stands for.** A mock returning a field the API
omits lets a component depend on something that will not be there. Nullable-but-
present fields are present as `null` rather than omitted, because those are
different responses.

**Encode the server's invariants.** Where the API guarantees something — every
claim carries citations, every served claim is uniformly untrusted — the fixtures
guarantee it too, so a component cannot pass by being right for the wrong reason.

**Stateful where the behaviour under test is "does the UI re-read from the
server".** A fixed handler passes for a component that merely guessed correctly.
Stateful stores export a reset for teardown; `server.resetHandlers()` does not
clear module state.

## Render through the helper

`renderWithProviders` mirrors the app's provider order. Rendering with the raw
library skips the theme provider and passes only while the component under test
happens not to need it.
