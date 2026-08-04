# Add a remote

**Read this first: you probably should not.**

Each remote's fetched total includes its own copy of the shared-fallback chunk —
around 154 KB gz — because the federation plugin gives each exposed module a static
import of every share shim, and each shim statically imports its local fallback.
The shares still resolve against the host's already-initialised instances, so one
React and one Salt are ever _instantiated_; the bytes are wasted and the semantics
are correct.

So a new remote starts about 154 KB gz in debt before it renders anything. The last
time this was measured, two new panels cost **1.3 KB gz** inside an existing remote
against roughly **340 KB** for a third one. A surface goes in an existing remote
unless it has a reason not to, and "it feels like its own thing" is not one.

Good reasons: a dependency that only this surface needs and that is large enough to
be worth isolating; a genuinely separate deploy cadence; an ownership boundary that
already exists in the organisation.

If you have one, here are the nine places that have to agree. Missing any of them
fails in a way that names something other than the cause.

## 1. The workspace

`remotes/<name>/` with `package.json`, `tsconfig.json`, `index.html`, and
`src/`. Copy an existing remote; the manifests differ by one line each.

## 2. `vite.config.ts`

Federation config exposing `./App`, the shared contract from
`tooling/federation/shared-modules.ts`, and a dev and preview port nothing else
uses. Ports go up by one: dev servers are `5170` upward, preview `4270` upward.

## 3. `vitest.config.ts` — do not skip this

A jsdom workspace **must** have its own vitest config. Without one it resolves
against `vite.config.ts` — with the Module Federation plugin loaded — and inherits
the default `node` environment. The failure appears inside the user-event library
as a missing document symbol and names nothing that points at the cause.

Copy an existing remote's config, including `setupFiles`.

## 4. The remote name in the contract

`packages/remote-contract/src/index.ts` declares `RemoteName`. Add yours. This is a
types-only package on purpose: a runtime value there would be duplicated into every
bundle and identity comparisons across the boundary would fail.

## 5. The host's descriptor table

`apps/shell/src/remotes/registry.ts` — label, mount path, required capability,
description, and any child pages with their own capabilities.

The capability is not optional and it is not decorative: it is how the shell
decides whether to _offer_ a destination without downloading the remote. It must
exist in the capability table, which means it must mirror a real API gate, which a
test checks against the API document.

## 6. The lazy import and its declaration

`apps/shell/src/remotes/lazy.ts` holds the only boundary-crossing imports.
`apps/shell/src/remotes/remotes.d.ts` declares the module, because declaration
generation is off — it would need the remote's dev server reachable during
typecheck.

## 7. The route

`apps/shell/src/App.tsx` builds routes from the descriptor. The path needs a splat
so the remote's own relative routes resolve, wrapped in the capability gate and the
remote boundary.

## 8. Scripts and config that enumerate remotes

- root `package.json` — a `dev:<name>` script, and the `build` chain
- `scripts/build-e2e.mjs` — the remote origin for the built lane
- `scripts/check-bundle-budget.mjs` — a budget entry. Without one the remote is
  unbudgeted, which is worse than a tight budget
- `playwright.config.ts` and `playwright.dev.config.ts` — a `webServer` entry.
  Wait on `remoteEntry.js`, not `/`: a remote's index page is its standalone
  harness and serves fine even when the federated artefact was never produced

## 9. The standalone entry

`src/standalone.tsx` plus the harness component, so the remote runs on its own for
development. It is reported against the budget but never served through the shell.

---

## Verify it

```bash
npm run ci
```

Specifically: `check-shared-parity` proves the new workspace pins the federated
dependencies identically, and `check-bundle-budget` proves you measured the cost
rather than assumed it. Then load the shell and confirm the nav entry appears for a
persona that holds the capability and is absent for one that does not.
