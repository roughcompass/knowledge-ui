# The design standard

**The reference is the current Vercel console. Salt is the implementation
substrate, and its defaults are overridden wherever the two disagree.**

Salt is an enterprise component library with opinionated defaults — uppercase
letter-spaced buttons, a 9px corner radius, semibold interface text, cards
carrying a shadow _and_ a border. The console being modelled differs from those on
nearly every axis, and the distance between the two is most of what makes a screen
read as a considered product rather than a design-system demo.

## What this does not mean

**Do not add the reference implementation's own packages or typefaces.** No
component library from it, no icon set, no font.

**And do not hand-roll what Salt already ships.** Salt components are the default;
custom markup or a new stylesheet needs a reason better than "the reference looks
slightly different". Reproducing a component in custom CSS buys an appearance and
gives up the accessibility, keyboard and theming work Salt maintains — and it puts a
second idiom into a repo whose standard is largely about not having those.

Where the reference genuinely differs, the route is Salt's _own_ published variables
— `--saltButton-textTransform`, `--saltDialog-borderRadius` — set in the one global
stylesheet. That is Salt's API rather than an override reaching past it, and it
means a component does not need a stylesheet to be the right shape.

Two components in this kit were rebuilt on that basis after being written the other
way: the note, which is now Salt's `Banner` with copy discipline on top, and the
metadata block, which is now `FlexLayout` rather than a bespoke grid. Both lost a
stylesheet and gained the behaviour Salt maintains.

So this document is a translation, not an import: the properties of the reference,
expressed in the vocabulary this repo can enforce.

---

## Colour: read the ramp by role, not by eye

The reference system organises colour as scales of ten steps, and the step number
carries the meaning. That is the part worth adopting, because it turns "which grey"
into a question with an answer:

| Steps    | Role                                           |
| -------- | ---------------------------------------------- |
| 100–300  | component backgrounds — default, hover, active |
| 400–600  | borders — default, hover, active               |
| 700–800  | high-contrast backgrounds                      |
| 900–1000 | text and icons — secondary, then primary       |

Beneath them sit two background steps: one default surface, one secondary surface
used sparingly for differentiation.

Two consequences for this repo:

**A new component picks its step by role.** Reaching for a hairline means the
border band, not "the light grey I saw somewhere else". The existing corrections
are recorded as one-off measurements — a specific alpha for hairlines, a specific
step for card borders — and re-expressing them by role is what stops the next
component guessing.

**A tint on the canvas, white surfaces on top.** The document itself is not the
brightest thing on screen; cards are. Dark mode is a first-class target, not an
afterthought — the reference's own identity is a near-black canvas, so a screen
that only reads well in light mode is half-built.

## Shape: a radius ladder, not a constant

The reference distinguishes surfaces by radius, and floating surfaces get more
than flat ones:

| Surface class                          | Radius |
| -------------------------------------- | ------ |
| Base surfaces — cards, inputs, buttons | 6px    |
| Large surfaces — panels, sheets        | 12px   |
| Floating — tooltips, menus             | 6–12px |
| Modal and fullscreen                   | 16px   |

**Built.** The ladder is a set of named roles in the global stylesheet —
`--kui-radius-surface`, `-surface-large`, `-floating`, `-modal`, `-fullscreen` —
each mapping to a real Salt curve step. A component picks `--kui-radius-modal`
because it _is_ a modal, rather than picking 6px because 6px is what the last
component used, which is how one constant ends up on everything.

`check-salt-tokens` enforces the bridge: a named role must be defined as one Salt
token and nothing else. Without that, `--kui-radius-modal: 13px` would satisfy
every check while being exactly the magic value the token rule forbids.

Two honest notes. The base tier was already correct at 6px; the modal was not, and
now uses 12px through Salt's own `--saltDialog-borderRadius`. And **fullscreen is
15px where the reference is 16px** — the curve scale has no 16 at this app's
density, so it is the nearest step. The same trade was already made for hairline
alpha, and it is recorded rather than rounded silently, because a value that is
close is fine and a value that is close while claiming to be exact is not.

**Elevation is reserved for things that genuinely float.** A card gets a border
_or_ a shadow, never both — Salt's default is both.

## Hierarchy, corrected

A user audit found the scale inverted: card and tile titles rendered at 12px label
size under 14px body copy, section headings at 16px, stat values inheriting body —
so the elements that govern structure were quieter than the prose inside them, and
whole pages read as an undifferentiated wall. The root cause was systemic, not any
one choice: the `as`/`styleAs` split let every compact component quiet its own
title independently, and nothing required the scale to stay monotonic across roles.

The contract, now baked into the kit components rather than re-chosen per screen:

| Role                    | Size          | Where it lives                       |
| ----------------------- | ------------- | ------------------------------------ |
| Page title              | 32            | `PageHeader` (`styleAs="h1"`)        |
| Page description        | 16 regular    | `PageHeader`                         |
| Section heading         | 20            | `SectionHeading` (`styleAs="h3"`)    |
| Card / band title       | 22            | `SectionCard`                        |
| Nav-card / tile title   | 16            | `NavCard`, `EmptyState`              |
| Stat value              | 24            | `StatTile` — the only display number |
| Body                    | 14            | —                                    |
| Card description        | 16 regular    | `SectionCard`                        |
| Label / hint / notation | 12, secondary | —                                    |

The page title and description are one typographic unit on consecutive line boxes,
with no added layout gap. The eyebrow and metadata remain separate context, with
16px between those rows and the title unit. This keeps explanatory copy visibly
attached to the page it describes without shrinking it into hint text.

An earlier revision of this document held the page title at 24px as a reading of
the reference; in practice, against 14px body and compressed card titles, it
flattened. The correction is recorded rather than silently swapped, per this
document's own rule about values that are close while claiming to be exact.

**Buttons and links now follow one litmus**: "Open / View / Browse + noun"
navigates and is an anchor — as `LinkButton` when it needs button prominence, as
an accent `KLink` when it is a section action, as the dense table register
otherwise. "Save / Delete / Run + noun" mutates and is a real `Button`. A `Button`
with an `onClick` that only navigates is the defect this rule exists to prevent.

**Notices are calm and placed where they change behaviour**: `UnavailableNotice`
renders secondary, not filled; a caveat that changes what the reader should do
sits above the content it qualifies; one that explains how to read a number is a
hint or a notation line, never a banner; one that is true on every visit is one
quiet foot line, or deleted. One callout per section, maximum.

## Type: a named scale, set as a unit

The reference names each style by role and size — heading, copy, label — and each
name presets size, line height, letter spacing and weight _together_.

That is the part to adopt. This repo currently corrects tracking per component,
which means the relationship between size and tracking is re-derived at each site
and drifts. A named scale fixes the whole tuple once.

Tighter tracking as size increases is the specific correction Salt needs: at
display sizes its default of zero reads loose.

## Buttons

|             |                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Case        | **Title Case**, verb plus a specific noun — "Adopt Capability", "Rotate Key", "Mark Read"                                  |
| Never       | "Submit", "OK", "Continue", "Get Started"                                                                                  |
| Weight      | medium, not semibold                                                                                                       |
| Tracking    | normal — Salt's letter-spaced uppercase default is the single strongest signal of an unstyled enterprise library           |
| Variants    | default, secondary, tertiary, error, warning — mapped once onto Salt's appearance and sentiment, and not recombined ad hoc |
| Disabled    | only when the action is impossible, and always with a tooltip saying why or who could                                      |
| Destructive | pairs one-to-one with a confirmation, and reports its result                                                               |

**Note this reverses an earlier reading of the reference**, which had buttons in
sentence case. The current console uses Title Case with noun specificity, and the
noun is the useful half: "Adopt Capability" tells a reader what will be adopted.

## Navigation

**The rail nests. It does not drill.** Every section and every child the reader's role
grants is on screen at once; sections are disclosures, collapsible and remembered,
and the leaves are the links.

It used to replace its own contents on entering a section, with a back control to the
dashboard as the only way out. That made a lateral move cost three navigations — and
no reader of this product works inside one section for a session. A producer's loop is
a capability, then its usage, which lives in the other remote, then the change inbox.
An auditor's crosses all three sections. The drill optimised for a reader who does not
exist.

Salt's `NavigationItem` has published `parent`, `expanded`, `level` and `blurActive`
the whole time; the replace-the-panel behaviour was never a constraint of the
component. The widest role sees four sections and eighteen leaves, which fits the
rail's existing scroll container.

**The active indicator touches the viewport edge; the item does not.** The three-pixel
accent starts at the rail's outside edge, while the active surface and every label keep
the rail's 16-pixel inline gutter. Moving the indicator inward with the menu content
makes the rail look like a card floating inside another card and weakens the location
signal.

Three rules follow from nesting:

- **A section is not a destination.** Every section's href used to be its own first
  child's, so two rows went to the same place and only the child could carry
  `aria-current`. Sections now own no route.
- **A collapsed section that holds the current page says so**, via `blurActive`.
  Closing a section must not lose where you are.
- **A label matches the page it opens.** Five did not — "Metrics" opened
  "Operational health", "Dashboard" opened "Graph". The second of those was invisible
  until nesting put the app's own Dashboard on screen beside it, which is the general
  hazard: a name only has to be unique among the things visible at the same time, and
  nesting changes what those are.

**The breadcrumb is a location readout, not a second navigation.** Four segments —
tenant, section, page, entity — built from the path, because the pages that would
report it live in remotes and a context does not cross that boundary. It carries no
`aria-current`: the rail already marks the current page, and an end-to-end invariant
asserts that no two elements claim it.

## Loading, and why there is a skeleton now

This kit refused skeletons for a long time, and the reasoning was sound: a skeleton
has to mirror the shape of the content to be worth anything, and a mirror that drifts
is worse than an honest spinner.

What made that decisive was an assumed shape of the answer — a `Skeleton` exported to
pages, each composing a wireframe by hand, each free to fall out of step with the
content beside it. **The drift is a property of hand-composition, not of skeletons.**

So the bar is built and is _not_ exported. No page can reach it. The components that
render placeholders generate them from the same declaration that builds their real
content: `DataTable` from its `columns` array — the identical array that builds the
header and the cells — and the tile and description list from their own slots. There
is no second description of the shape, so there is nothing to keep in sync.

`LoadingPanel` survives for waits that are not tabular: a single record being read, a
mutation in flight.

Two rules for anything that animates, which this is the first of in this repo:

- The region carries `aria-busy`, the bars are `aria-hidden`, and a visually hidden
  live region says what is loading. Placeholder bars announced individually are a run
  of empty elements.
- Every animation ships with its `prefers-reduced-motion` escape in the same
  stylesheet. A pulse is decoration; the bar still says "content is coming" without
  it.

## Links

Salt ships `Link`, and until recently nothing used it. Every inline link in the app
was react-router's `Link`, which renders a bare `<a>` — and nothing here styles an
anchor. Not Salt's `global.css`, which is thirty-nine lines and touches no `a`. Not
the next theme. Not this repo's one global sheet. So every link in every page
rendered at the user agent's default: blue, underlined, purple once visited, and in
dark mode very nearly black on black.

Seventeen sites across ten files, since the first page shipped. It is worth naming
why nothing caught it: lint sees a valid import, the token guard checks that tokens
resolve rather than that a declaration exists, jsdom computes no styles, and the
end-to-end sweeps assert copy and landmarks. A missing style has no failing check —
only a reader.

**`KLink` is the only anchor.** It is Salt's `Link` with a routing seam, so it carries
rest, hover, active, focus and visited — the last through
`--salt-content-foreground-visited`, a real token in the shipped theme — plus the
external-link icon and its visually hidden text. Hand-rolling anchor CSS would
reimplement four states and the screen-reader text, badly.

Two presentations, both from Salt's own API rather than a stylesheet:

| Context                                | Form                               |
| -------------------------------------- | ---------------------------------- |
| Prose, a card action, a header control | the default — underlined at rest   |
| A table cell, a list of ids            | `underline="never" color="accent"` |

A table whose primary column is a link renders one underline per row, which reads as
a ruled form rather than a list; accent colour carries the affordance instead. Colour
alone is not an affordance for a reader who cannot distinguish it, so the underline
returns on hover, from one declaration in the global sheet.

**The router is handed to ui-kit, not imported by it.** ui-kit is imported by three
bundles and takes no react-router dependency, so an adapter is installed at each
bundle root. That installation exists three times on purpose: workspace packages are
excluded from the federation share contract, so each remote carries its own copy of
ui-kit, and a React context is identified by object identity — a provider mounted only
in the shell is invisible to every component in a remote.

Enforced by lint: react-router's `Link` and `NavLink` are unimportable in `apps/**`
and `remotes/**`. Four files are exempt — the three adapter installations, and the app
frame, where a `Link` handed to Salt's `render` prop _is_ the anchor Salt renders.

## Tables

- **One separation mechanism.** Striped or bordered, never both, and plain is a
  legitimate default.
- **Headers are Title Case nouns or noun phrases** — "Last Used", "Requests (7d)".
  Never sentences.
- **Numeric columns use tabular figures** so digits align down the column. **Built,
  and the two turned out to need separating.** Right alignment and tabular figures
  want each other for a _count_, and the table's API coupled them on that basis — but a
  timestamp column wants the digits to line up without being pushed right, since its
  values are all the same length and right-aligning pulls them off the label beside
  them. So `align` decides where a column sits and `figures` decides how its digits are
  cut; a count asks for both, a timestamp for one.
- **Sortable headers are real buttons**, with the sort direction shown.
- **A row that goes somewhere shows it on hover.** The hover cue keys on the table
  having a linked column: `href` on the column, or `linked: true` when the column's
  own `render` builds the anchors — the table cannot see inside a rendered node, so
  the column says so.
- **Tables are for tabular data**: rows sharing a shape, with at least one column
  comparable across rows. A single descriptive row with an action is an entity
  row; a block of metadata is a description list, **not** a two-column table.

That last rule is the one this repo breaks most: a two-column key/value table is
the wrong shape for metadata, and it reads as data that can be compared when it
cannot.

## Empty states

Anatomy: an icon around 32px, a Title Case title, a sentence-case description,
and at most one primary plus one secondary action.

- **The description adds information rather than restating the title.** "No Logs
  Match Your Filter" followed by "there are no logs matching your filter" is a
  wasted line.
- **Quote the query back** when the emptiness is a search result.
- **Actions are Title Case verb-plus-noun**, and are real buttons or links so they
  stay keyboard-reachable. This is where "Get Started" and "Continue" are called
  out as too vague — a call to action names what happens next.
- **Asynchronously filtered regions announce politely**, so a screen-reader user
  learns the result set changed.
- **Not for persistent warnings.** Those are notes or page-level banners.

## Notes, banners, toasts

A note is **inline contextual feedback** beside the thing it describes. Variant by
meaning: error for a problem the reader must fix, warning for a consequence to
acknowledge, success for a passed check, neutral otherwise.

- **A note is persistent.** No dismiss control — it stays until the underlying
  state changes, because a dismissable note competes with its own message.
- **One inline action at most.**
- **Label is one or two Title Case words** naming the topic; the body is one
  active-voice sentence about impact. No "Heads up", no "FYI".
- Page-level messages are banners. Transient confirmations are toasts.

**Built**, as `Note`. Four variants chosen by meaning, no dismiss prop — the
absence is structural, because a reader who closes a caveat to clear the screen has
removed it while it still applies — and a single `action` slot rather than children,
since two buttons make a note a decision point and a decision does not belong in
one.

The three ways to tell a reader something are now distinct, and picking the wrong
one is how a console acquires a second idiom:

|                     | Means                             | Will it fill?          |
| ------------------- | --------------------------------- | ---------------------- |
| `Note`              | a caveat about data on this panel | n/a — it qualifies     |
| `UnavailableNotice` | the data does not exist to fetch  | no                     |
| `EmptyState`        | the query ran and found nothing   | yes, when data arrives |

### The rest of the "missing primitives" were a mistake in this document

An earlier revision listed `Toast`, `EntityRow`, `Skeleton` and `Tabs` as still to
build. Checked against Salt, three of the four should not be built at all, and saying
so is more useful than shipping them:

| Wanted      | Reality                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `Tabs`      | Salt ships the whole family — `Tabs`, `TabBar`, `TabList`, `TabPanel`, `TabTrigger`. Use it directly    |
| `EntityRow` | Salt's `LinkCard` and `InteractableCard` are a descriptive row with one action, which is the definition |
| `Skeleton`  | Built — but internal, and generated rather than composed. See below                                     |
| `Toast`     | Salt ships it, and it is still the wrong choice here — see below                                        |

The general lesson, which is why this table stays rather than being deleted: a
standard that lists components to build without checking the design system first will
grow a parallel kit. The question is always "does Salt have this", and the answer was
yes three times out of four.

**The lesson has a second half, learned later and more expensively: asking whether
Salt has it is not enough if nothing then uses it.** `Link` was in Salt the whole
time and had zero consumers, so every anchor in the app rendered unstyled — see
[Links](#links). So were `Tabs`, which this table recommends using directly and which
nothing imports; `GridItem` and `ParentChildLayout`, while every page stayed a single
column; and `NavigationItem`'s `parent`/`expanded`/`level` props, while the rail
replaced its own contents to descend one level. A component that exists, is
documented here, and is unused is indistinguishable from one that was never built —
except that the gap is harder to see.

**No toast, and the reason is behavioural rather than technical.** Salt's core does
export a `Toast`, and it is presentational — no provider, so nothing about the
federated boundary prevents it. What rules it out here is that in an operator console
the result of a write is a receipt for a side effect somewhere else: a message that
vanishes after a few seconds is unreadable while the reader is also watching a table
refresh, and "did that work?" becomes unanswerable without doing it again. So a write
result is a banner in place, persistent, naming the effect rather than the verb.

An earlier version of this document and of the component's own docstring claimed Salt
shipped no Toast. It does; the claim was wrong and the conclusion was right for a
different reason, which is worth separating.

---

## What is enforced, and what is only agreed

Stating this precisely matters, because a rule that claims a gate it does not have
is the same defect as a number claiming a strength it cannot bear.

| Property                                                                             | Mechanism                                              | Kind            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------- |
| Every design value is a Salt token that resolves                                     | stylelint allow-list plus `check-salt-tokens`          | **Enforced**    |
| No CSS-in-JS, no utility CSS, no unscoped stylesheet outside the three theme entries | lint, asserted per workspace by a resolved-config test | **Enforced**    |
| No raw hex, no literal values in a style prop                                        | lint                                                   | **Enforced**    |
| A chart only renders through the figure component that pairs it with a table         | restricted-import rule                                 | **Enforced**    |
| Every anchor is Salt's `Link` through the kit's `KLink`                              | restricted-import rule                                 | **Enforced**    |
| No component names a role                                                            | lint                                                   | **Enforced**    |
| Salt-covered elements are not used raw outside the ui-kit                            | lint                                                   | **Enforced**    |
| Accessibility on every route, light and dark                                         | axe over the built artefacts, both modes               | **Enforced**    |
| Every route has exactly one page heading, including the ones that refuse             | end-to-end sweep over all routes                       | **Enforced**    |
| Button labels are Title Case, table headers are Title Case nouns                     | end-to-end sweep over all routes as an admin           | **Enforced**    |
| Numeric columns are right-aligned with tabular figures                               | asserted on the classes Salt's own rule is keyed on    | **Enforced**    |
| A wrapping column wraps, and a wide table scrolls rather than clipping               | computed `white-space` and measured overflow           | **Enforced**    |
| A link in a table cell renders in the link colour, content included                  | computed colour against the body colour                | **Enforced**    |
| The search panel occupies screen, not only the document                              | `elementFromPoint` at the panel's own coordinates      | **Enforced**    |
| One idiom per interaction, slot usage, radius by surface class, noun choice          | review                                                 | **Agreed only** |

The bottom row is the honest gap. Three deviations once passed lint, typecheck, the
token guard and the bundle budget, and were caught by a human reading the screen —
because none of those checks can tell a dropdown from three toggle buttons. Some
of it is narrowable to a path rule and some is not; where it is not, this document
is the citation a reviewer points at.

**The dark row claimed a gate that did not exist, and now does.** It read "light and
dark, Enforced" while the sweep ran in one mode and no second pass appeared anywhere
in the end-to-end specs — a table claiming a gate it does not have is the same defect
as a number claiming a strength it cannot bear. It had a live cost: every inline link
in the app rendered as an unstyled browser-default anchor, which is worst in exactly
the mode that was never checked. The sweep now runs both modes over every route, and
asserts the mode took before trusting the result, because a dark run that silently
rendered light is a green result for a check that never happened.

Three rows moved _up_ from that gap, and how they moved is the reusable part: each
was a rule about what reaches the screen, so none of them was ever going to be a
lint rule, and each became an assertion in the end-to-end lane instead — the only
one that sees rendered output across a host and two remotes.

Case was the clearest case for it. Fourteen distinct button labels, two wrong, both
on a page nobody had reopened — small enough that reviewing by eye finds most of
them and reliably misses the last two.

Alignment is the cautionary one. It was _declared_ for every numeric column in the
app and never once took effect: first never read, then read and resolved to a CSS
class that Salt's own `table.saltTable td` rule outranks. Nothing failed either
time. A stylesheet declaration that loses a specificity contest is invisible to
stylelint, to the token guard, and to jsdom — which computes no styles at all — so
the assertion had to be about the mechanism Salt keys its rule on rather than about
the declaration or the pixels.

### Correct in the DOM, absent from the screen

Alignment was not an isolated case, and treating it as one cost three more. A
walkthrough of the built console found, in one pass:

- **A column that opted into wrapping did not wrap.** The opt-out class lost to the
  compound cell rule beside it, so the class applied and the text still ran off the
  side — one table carried 470px of width nobody could see it carry.
- **A link cell was a link the colour of body text.** The table wraps link columns
  in an anchor, but a column renders its own content and Salt `Text` sets its own
  foreground, so the affordance died one element inside the thing that provided it.
- **A floating panel that never once appeared.** It was positioned correctly,
  populated correctly, and clipped by an ancestor's `overflow` — which `z-index`
  cannot escape, because it is not a stacking problem.

The shared shape is worth naming, because it will happen again: **every one of them
had the right markup, the right class, and the right computed intent, and a reader
could not see any of them.** A component test asserts that a class is applied. A
review reads the source. Neither is looking at the only thing that matters, which is
whether the rule won.

So the rule for this class: when a change depends on a declaration beating another
declaration, on an element escaping an ancestor, or on a value inherited across a
component boundary, assert the **effect** in the end-to-end lane — computed style,
measured geometry, or what `elementFromPoint` returns — not the form in a unit test.
Four such assertions now exist beside the alignment one, and each was written after
watching it fail.

The cheapest way to find this class is still to open the app and look at it.
