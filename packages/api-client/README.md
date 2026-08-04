# `@knowledge-ui/api-client`

The typed client for the registry API: one module per API domain, the query-key
factory, and the error model.

## What it owns

- **`client.ts`** — a hand-rolled fetch wrapper with a deadline, a 401 latch and
  error classification. Deliberately not a proxy over the generated paths: that
  costs stack traces and inspectability, and the header says so.
- **One module per domain** — `identity`, `catalog`, `search`, `audit`,
  `operationalHealth`, `adoptions`, `subscriptions`, `notifications`, `memory`,
  `impact`, `adminSync`, plus `mutations` for the write path.
- **`keys.ts`** — every key namespaced `['kui', persona, tenant, …]`.
- **`generated/`** — types only, from the vendored OpenAPI document. Never edited.

## Rules

**A new domain gets its own module.** Two modules once held eight domains between
them, one of them named `hooks.ts` while three of its siblings were also hooks.

**Key on everything that changes the answer.** Not just the resource id: a key
holding only the root will serve a depth-1 traversal under a depth-3 heading.

**The barrel exports by name.** A star export makes this package's surface depend
on what happens to be exported downstream.

**Regenerate, never hand-edit.** `npm run codegen`; a CI lane fails on any diff.
Where a type is hand-written instead, the reason is in a comment — the generated
error type describes a shape the server does not send, and unset session fields
are absent rather than null.
