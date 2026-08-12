# DE Context Plane for Agents

DE Context Plane for Agents is the Salt Design System interface to the governed
capability contextplane. A host shell owns identity, navigation, and the API client;
federated remotes own their own screens.

The contextplane is a governed, multi-tenant memory of what a platform ships —
capabilities, their interfaces, their owners, their dependencies, and claims about
them carrying provenance and confidence. This app is where a human reads that
memory: browsing capabilities, deciding whether changing one is safe, checking
what the memory believes and how much to trust it, probing whether retrieval
supplies the context an agent needs, and running the service.

---

## Quickstart

```bash
nvm use                # Node 22, enforced by engine-strict
npm ci
npm run doctor         # seed the dev personas, then prove they resolve
npm run dev            # shell :5170, catalog :5171, operations :5172
```

Open <http://localhost:5170>.

**No backend to hand?** `npm run dev:mock` runs the same app against the request
handlers the tests use, and needs none of the three services below — skip
`doctor` too. See [If you have no backend](#if-you-have-no-backend).

**Run `doctor` first, and re-run it after restarting the backing services.** The
entitlement store is in memory, so a restarted container answers every request
with a bare `403` that looks exactly like a broken permission and is a lost seed.

### What has to be running

Three services, none of them in this repo. All requests are relative and go
through a proxy on the dev and preview servers, because the contextplane publishes no
CORS headers — a cross-origin call fails at the preflight before the app sees a
response.

| Service                | Default | Override              |
| ---------------------- | ------- | --------------------- |
| Contextplane API       | `:8000` | `KUI_API_TARGET`      |
| Mock identity provider | `:8090` | `KUI_IDP_TARGET`      |
| Entitlement service    | `:8091` | `KUI_ENTITLEMENT_URL` |

Every variable the repo reads is documented in [`.env.example`](.env.example).
Nothing is loaded from that file — it is the reference. `vite dev` reads
[`.env.development`](.env.development), and all three apps point `envDir` at the
repo root so one file serves the workspace.

### If you have no backend

You do not need one — to run the app, or to test it.

```bash
npm run dev:mock       # same three servers, no backend, no doctor
```

Open <http://localhost:5170>. Every request the app makes is answered by the
same handlers the tests assert against, including the token endpoint — so the
persona switcher works with no identity provider running, and switching persona
changes what the app refuses exactly as it does against a real contextplane.

What you are looking at is fixture data. It is deliberately not a copy of any
seed: names like `pattern-library` exist only here, which is also how you can
tell at a glance which lane you are in.

All three origins intercept, not just the shell: the standalone harnesses on
`:5171` and `:5172` are separate documents, and a service worker's scope is the
origin that served it, so each carries its own copy of the worker. `guards`
checks all three against the installed library, because a partial regeneration
leaves one origin on a different version and fails quietly.

The interceptor outlives the run that registered it, which is what service
workers do. Switching back to `npm run dev` in the same browser is safe anyway —
the handlers only answer for a page that asked for them.

The test lane is the same handlers compiled into the built artefacts:

```bash
npm run build:e2e && npm run e2e -- --project=mocked
```

That is also what CI runs, deliberately: a UI repo whose tests only pass when a
backend happens to be up is a repo whose tests stop being run.

---

## Who you are

| I am…                           | Start here                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **New to the repo**             | [`docs/01-overview/01-orientation.md`](docs/01-overview/01-orientation.md)                          |
| **Adding a screen**             | [`docs/03-guides/01-add-a-screen.md`](docs/03-guides/01-add-a-screen.md)                            |
| **Adding a remote**             | [`docs/03-guides/02-add-a-remote.md`](docs/03-guides/02-add-a-remote.md) — nine files have to agree |
| **Changing how it looks**       | [`docs/04-design/01-standard.md`](docs/04-design/01-standard.md)                                    |
| **Wondering why a gate failed** | [`docs/05-reference/01-guards.md`](docs/05-reference/01-guards.md)                                  |
| **An agent editing this repo**  | [`CLAUDE.md`](CLAUDE.md)                                                                            |

---

## Layout

```
apps/shell                 session bootstrap, navigation rail, remote registry, error boundaries
remotes/catalog            capability browse and detail, impact, adoption, subscriptions,
                           notifications, claims, workspaces, context probes and ARC receipts
remotes/operations         health, operational health, usage, audit log, sync connectors and runs
packages/remote-contract   the typed host-to-remote handshake (types only, no runtime export)
packages/auth              session, roles, the capability table, the dev persona roster
packages/api-client        generated OpenAPI client, query keys, one module per API domain
packages/ui-kit            every shared component; the only workspace with stylesheets
packages/testing           request mocks, fixtures, render helpers
tooling/                   the federation share contract and the dev/preview proxy
scripts/                   guards, the end-to-end build, persona seeding
```

Two things about this layout are load-bearing rather than tidy:

**The nav lives in the host.** `apps/shell/src/remotes/registry.ts` declares remote
mounts and the navigation sections that point into them. The shell can decide
whether to _offer_ a destination without downloading the remote that serves it.
Keeping those models separate also lets the Graph remain its own product area
while the catalog remote continues to serve it. Context Lab works the same way:
it is a first-class product area without becoming a separate deployment bundle,
while Claims and Workspaces remain views within Catalog.

**`packages/remote-contract` exports no runtime value.** It is not federated, so a
value there would be duplicated into every bundle and identity comparisons across
the boundary would fail. The instances that must be single — the API client and
the session — travel as props.

---

## Commands

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `npm run dev`        | All three servers, with the API proxy wired                       |
| `npm run dev:mock`   | The same servers against intercepted requests — no backend at all |
| `npm run doctor`     | Seed the persona entitlements, then verify they resolve           |
| `npm run ci`         | The whole pipeline. Identical to what CI runs                     |
| `npm run ci:static`  | Lint, stylelint, typecheck, guards, format                        |
| `npm run ci:unit`    | Unit and component tests                                          |
| `npm run ci:e2e`     | Build the artefacts, run the mocked lane, check the bundle budget |
| `npm run ci:secrets` | Production build, then assert the dev roster was elided           |
| `npm run e2e:dev`    | The specs against your own dev servers and a real contextplane    |
| `npm run codegen`    | Regenerate the typed client from the vendored OpenAPI document    |

`npm run ci` is the whole pipeline and each `ci:<lane>` is one part of it. The
workflow calls the same scripts, so there is no check in CI that you cannot run
here.

---

## Conventions worth knowing before your first change

- **Salt tokens only.** No raw hex, no literal pixel values, no CSS-in-JS. Styling
  is a colocated `*.module.css` in the ui-kit, and `check-salt-tokens` verifies
  every token actually resolves in the shipped theme.
- **The UI never decides permissions.** Components ask
  `can(session, 'adoption:write')`; only the capability table knows which roles
  carry what, and a test asserts every entry against the API document. Comparing
  a role to a literal is a lint error.
- **A surface goes in an existing remote unless it has a reason not to.** Each
  remote pays its own copy of the shared-fallback chunk — around 154 KB gz — so a
  new remote is not free. Measure before adding one.
- **Say what is absent, and why.** An empty panel, a filtered-out row and a
  metric that cannot be measured look identical if rendered carelessly, and they
  call for completely different actions. Rendering zero for any of them is a bug.
- **No references to planning documents in code.** The planning repo is not
  shipped here, so a pointer to it resolves to nothing. State the rule in the
  code's own words. Enforced by `check-no-doc-refs`, which also scans Markdown.

The long forms are in [`docs/`](docs/), and the rules an agent needs are in
[`CLAUDE.md`](CLAUDE.md).
