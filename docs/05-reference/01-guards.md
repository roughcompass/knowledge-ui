# The guards

Seven scripts. `npm run ci` runs all of them; each exists because something went
wrong once.

| Script                           | Fails when                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `check-salt-tokens`              | a `var(--salt-*)` reference does not resolve in the shipped theme, or resolves only in the legacy one                            |
| `check-shared-parity`            | a workspace pins a federated dependency differently from the share contract                                                      |
| `check-no-doc-refs`              | code or Markdown references a planning document                                                                                  |
| `check-bundle-budget`            | an artefact's fetched total exceeds its budget                                                                                   |
| `check-operational-data-sources` | a screen names an external dashboard as operational truth, or parses the metrics exposition format in a browser                  |
| `check-no-dev-secrets`           | the dev persona roster reaches a production artefact — or the build output is missing, so there is nothing to check              |
| `check-spec-freshness`           | the vendored API document falling behind the running service, which makes whole domains unreachable with every check still green |

## Why each one exists

**`check-salt-tokens`** was written after a shipped bug made two of three chart
series invisible: the tokens were spelled plausibly and defined only in the theme
the app does not load. Stylelint checks that a value _starts with_ a token
reference; this checks that the token exists.

**`check-shared-parity`** guards a failure that is silent by default. A version
skew across the federated boundary logs a console warning and loads a second copy
of React — two reconcilers, hook errors pointing at innocent components. It reads
the contract by path and regex, deliberately, so it needs no TypeScript loader —
which also makes it the guard a file move breaks silently.

**`check-no-doc-refs`** keeps this repo self-contained. The planning documents live
in a different repository and are not shipped, so a reference to one resolves to
nothing for a future reader and implies a reason exists somewhere without carrying
it. It scans Markdown as well as code. Escape hatch: end the line with
`doc-ref: intentional`, for a stable public URL.

**`check-bundle-budget`** is the only remaining size guard, because `manualChunks`
does nothing under Module Federation. It measures the federated graph — what a
reader actually downloads when the shell mounts a remote, including the per-mount
shared-fallback transfer, which it counts rather than assuming away after a network
trace disproved the assumption.

**`check-operational-data-sources`** is a text scan rather than a lint rule,
because the mistake is reachable by fetching a URL and splitting on newlines. It
bans two things: naming an external dashboard as the source of operational truth,
because a console whose operations page is a set of links into a tool that may not
be installed is an absent page rather than a degraded one; and reading the metrics
exposition format in a browser, because those numbers are per-replica and
cumulative and the reader cannot tell.

**`check-no-dev-secrets`** replaced four lines of shell that had a false negative:
`grep` over a directory that does not exist prints nothing and exits non-zero,
which read as "clean" — so it passed whenever the build had not run, the one case
where it proves nothing. It now fails on absent output, checks the client ids as
well as the secret, and recognises the mocked build, which bakes the roster in on
purpose.

## The guard that guards the guards

`tooling/__tests__/resolved-config.test.ts` is not in the table because it is a test
rather than a script, but it belongs in the same family. Flat lint config replaces a
rule's options rather than merging them, so a later block silently discards every
earlier entry for the files it matches — and reading the config cannot tell you what
survived, only resolving it per file can.

That has now happened three times in this repo: to the raw-hex ban, to the package
bans, and to the chart-mark ban inside the stylesheet exemption. The test resolves
the config for one file per neighbourhood and asserts each rule arrived intact,
which is the only mechanism that has actually caught it.

## The guard the gates do not have

None of them checks **idiom**. Three deviations from the design standard once
passed lint, typecheck, the token guard and the bundle budget, and were caught by a
human reading the screen — because no static check can tell a dropdown from three
toggle buttons. See [`../04-design/01-standard.md`](../04-design/01-standard.md),
which is the citation a reviewer points at instead.
