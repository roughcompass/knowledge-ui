# Conventions for `knowledge-ui`

Read this before editing. It is the set of rules that are enforced but not
obvious, plus the traps that have already cost someone a debugging session.

For orientation and how to run things, see [`README.md`](README.md). This file is
the part a reader would otherwise discover by breaking something.

---

## This is its own repository

`knowledge-ui` is a git repo with a remote at `roughcompass/knowledge-ui`. It sits
beside two others in the same parent directory, and they are unrelated history:
the registry backend, and a planning workspace.

**Never `git add` a path outside this directory.** A change that spans repos
produces one commit in each; neither is shared.

---

## The gates, and what each one exists to catch

`npm run ci` runs all of them. Each `ci:<lane>` runs one part. Every check in CI
is one of these scripts — there is nothing in the workflow you cannot run here,
and that property is asserted rather than hoped for.

| Guard                            | Catches                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `check-salt-tokens`              | a `var(--salt-*)` that does not resolve in the shipped theme. Written after two of three chart series rendered transparent |
| `check-shared-parity`            | a workspace pinning a federated dependency to a different version, which instantiates a second React or a second Salt      |
| `check-no-doc-refs`              | references to planning documents, in code **and in Markdown**                                                              |
| `check-bundle-budget`            | growth in what a reader actually downloads, measured over the federated graph                                              |
| `check-operational-data-sources` | naming an external dashboard as the source of operational truth, or parsing the metrics exposition format in a browser     |
| `check-no-dev-secrets`           | the dev persona roster reaching a production artefact                                                                      |

Two of these are worth understanding rather than just obeying:

**`check-no-doc-refs` scans Markdown too.** So documentation in this repo cannot
cite a requirement number, an architecture-decision label, an open-question label,
a task id, or a delivery-phase number. State the rule in the code's own
vocabulary. The point is that this repo has to make sense to someone who only has
this repo.

**`check-shared-parity` reads the share contract by path and regex**, precisely so
it needs no TypeScript loader — which makes it the guard a file move breaks
silently. If you move `tooling/federation/shared-modules.ts`, update the script.

---

## Authorization is mirrored, never invented

`packages/auth/src/capabilities.ts` maps capabilities to roles. Components ask
`can(session, 'audit:read')` and never name a role — comparing `.role` to a
literal is a lint error outside that package.

The table mirrors what the API enforces. Where they disagree, **the API is right**.
A test asserts every entry against the vendored OpenAPI document, so adding a
capability forces you to go and read the router.

Two constraints make this sharper than it looks, and both have caused defects:

**Roles collapse.** The server resolves a principal to exactly one role by
precedence `admin > producer > consumer > auditor`. So a principal holding admin
and auditor resolves to admin and _loses_ auditor-only access. Adding `admin` to
`audit:read` would not widen access — it would produce a nav entry leading to a
guaranteed refusal.

**Read and write gates are not symmetric.** Adoption is the worked example:
listing admits all four roles, while adopting is producer-or-admin and excludes
consumer outright. A single entry can only be as permissive as its narrowest use,
so adoption needs two. This shipped backwards once, with a test that certified it,
because the test drove a mock rather than the gate.

---

## Testing

Four lanes, and each covers something the others cannot:

- **Unit** — pure logic. Default home.
- **Component (jsdom)** — wiring that only exists in a DOM.
- **End-to-end, mocked** — the built artefacts with request mocks compiled in.
  The only lane that exercises real Module Federation, because `vite dev` serves
  remotes through a different path. This is the CI gate.
- **End-to-end, live** (`npm run e2e:dev`) — the same specs against a real
  registry. Catches drift between the hand-written mocks and the actual API. Not
  in CI, because the workflow provisions no backend.

### Traps

**Every jsdom workspace needs its own `vitest.config.ts`.** Without one it
resolves against `vite.config.ts` — _with the Module Federation plugin loaded_ —
and inherits the default `node` environment. The failure surfaces inside the
user-event library as a missing document symbol, which names nothing that points
at the cause.

**Request mocks are stateful where the behaviour under test is "does the UI
re-read from the server".** A fixed handler passes for a component that merely
guessed correctly. Stateful stores need resetting in teardown;
`server.resetHandlers()` does not clear module state.

**A fixture must never be richer than the endpoint it stands for.** A mock that
returns a field the API omits lets a component depend on something that will not
be there. Where the server guarantees an invariant — every claim carries
citations, every served claim is uniformly untrusted — the fixtures encode it, so
a component cannot be right for the wrong reason.

---

## Bundle economics

Each remote's fetched total includes its own copy of the shared-fallback chunk,
around **154 KB gz**, because the federation plugin gives each exposed module a
static import of every share shim and each shim statically imports its local
fallback. The shares still resolve against the host's already-initialised
instances, so one React and one Salt are ever _instantiated_ — the bytes are
wasted, the semantics are correct. Verified in a browser rather than assumed.

The consequence: **a new remote costs a duplicate of that chunk, so a surface goes
in an existing remote unless it has a reason not to.** The last time this was
measured, two new panels cost 1.3 KB gz inside an existing remote against roughly
340 KB for a third one.

`manualChunks` does nothing under Module Federation, so the bundle budget is the
only remaining guard against size regression.

---

## Design

The reference is the **current** Vercel console; Salt is the substrate, and its
defaults are overridden where the two disagree. Do not add the Geist packages or
typefaces — the look is implemented in Salt tokens and CSS modules.

The measured values and the composition rules are in
[`docs/04-design/01-standard.md`](docs/04-design/01-standard.md). The short
version:

0. **Salt components are the default, and custom markup or CSS needs a reason.**
   Before writing a `div` and a stylesheet, check whether Salt ships the component —
   it usually does, and reproducing it buys an appearance while giving up the
   accessibility, keyboard and theming work Salt maintains. Where the reference look
   differs from Salt's default, reach for Salt's _own_ published variables
   (`--saltButton-*`, `--saltDialog-borderRadius`) in the one global stylesheet,
   rather than a new module. A note built on `Banner` and a metadata block built from
   `FlexLayout` both started as hand-rolled CSS and were rebuilt for this reason.
1. **Compose from the ui-kit, not from Salt directly.** Reaching past
   `PageHeader`, `SectionCard`, `DataTable`, `FilterBar`/`FilterField`,
   `EmptyState`, `ErrorPanel`, `LoadingPanel`, `StatTile` and `CursorPager`
   reproduces the layout without the corrections they carry.
2. **Use a component's own slots before adding structure.** `SectionCard`
   publishes `description`, `action`, `footer`, `banded` and `flush`.
3. **One idiom per interaction.** A selector is a bordered `Dropdown` with
   `Option`s inside a `FilterField`. Not toggle buttons, not segmented controls.
   A second idiom for the same job is what makes a console read as assembled
   rather than designed — and this rule has been broken twice.
4. **Action slots hold controls.** A refused action is a disabled control with a
   tooltip explaining who can act, not a sentence sitting among buttons.
5. **New primitives belong in the ui-kit**, not in a remote. A control invented
   inside a remote is invisible to the next screen that needs it.

**No guard checks idiom.** The token rule, the parity guard, the budget and the
doc-reference check all pass on a screen that breaks every rule above. That gap
is real, which is why these are written down.

---

## Honesty rules for anything that renders a number

These come from the product being a memory that has to say how much to trust
itself, and they are the difference between a dashboard and a source of truth.

- **Four kinds of empty are different**: the API does not publish this; it
  publishes it and there is no activity; it is not measurable in principle; the
  query failed. They call for completely different actions — file a requirement,
  do nothing, read the register, retry. Rendering zero for any of them is a defect.
- **A cumulative value says it is cumulative**, and states its reset or window
  semantics. No rate is ever derived client-side from a single observation.
- **Never compute a metric the API did not serve.** A number derived in a browser
  from a partial series is unverifiable and, under multiple replicas, wrong.
- **A partial answer says so.** A cached traversal or an unresolved version
  constraint is reported, because the reader most likely to be looking is the one
  deciding whether to ship a breaking change.
- **Where a caveat applies uniformly, state it once per view, not per row.** An
  identical marker repeated on every row becomes chrome the eye stops seeing,
  which is the one state a safety caveat must never reach.

---

## Commits

Subject says what changed and why it mattered; the body carries the reasoning and
the evidence — the counts, the measured sizes, what was verified and how. Task
ids belong in commit subjects if anywhere, never in code comments: git history
ships with the repo, so a commit reference stays resolvable where a planning
reference does not.
