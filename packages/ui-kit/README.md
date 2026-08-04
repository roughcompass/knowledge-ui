# `@knowledge-ui/ui-kit`

Every shared component, and the only workspace with stylesheets.

## Why the stylesheets live here

Nowhere else may import one. A component needing custom style gets a colocated
`*.module.css` in this package, where stylelint's token allow-list and
`check-salt-tokens` both apply. Three entry files import global theme CSS and are
exempt; nothing else is.

## Why screens compose from here rather than from Salt

These components carry corrections to Salt's defaults — radius, hairline weight,
elevation, interface weight, table separation. Reaching past them to Salt directly
reproduces the layout _without_ the corrections, which is how two screens end up
looking almost the same.

Salt-covered raw elements are banned outside this package. This is the one place
allowed to reach for them, because this is where the gaps get filled.

## Charts

A chart renders only through `Figure`, which pairs the mark with the data table it
was drawn from. The marks themselves are unimportable outside this package — a
restricted-import rule, because the pairing being a convention means the next page
under deadline skips it, and a chart without a table is unreadable to anyone who
cannot see it and uncheckable by anyone who can.

## New primitives belong here

A control invented inside a remote is invisible to the next screen that needs one,
which is how a second idiom for the same job starts.
