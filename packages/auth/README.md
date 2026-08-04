# `@knowledge-ui/auth`

Session, roles, the capability table, and the development persona roster.

## The capability table is the point

`capabilities.ts` maps capabilities to roles. Components ask
`can(session, 'audit:read')` and never name a role — comparing `.role` to a
literal is a lint error outside this package.

It **mirrors** what the API enforces; it does not implement it. Where the two
disagree, the API is right. A test asserts every entry against the vendored
OpenAPI document, so adding a capability forces you to read the router.

Two traps, both of which have caused defects:

- **Roles collapse.** One role per principal, by precedence
  `admin > producer > consumer > auditor`. A principal holding admin and auditor
  resolves to admin and _loses_ auditor access, so adding admin to an
  auditor-only capability would produce a nav entry leading to a refusal.
- **Read and write gates are not symmetric.** Adoption needs two entries: the
  read admits all four roles, the write excludes consumer outright.

## The persona roster carries credentials

`personaRoster.ts` is behind a dynamic import guarded on a build-time flag, so a
production build drops it. The secret comes from the environment rather than a
literal, because a literal survives tree-shaking into a sourcemap.
`check-no-dev-secrets` asserts the elision actually happened.
