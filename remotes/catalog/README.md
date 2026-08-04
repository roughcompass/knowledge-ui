# `@knowledge-ui/remote-catalog`

The consumer-facing screens: browsing capabilities, deciding whether to depend on
one, and reading what the memory believes about them.

| Surface       | Answers                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| Browse        | what exists, filtered and searchable, as a linkable URL                           |
| Detail        | one capability in full — attributes, facts, and optionally its bi-temporal fields |
| Impact        | what it depends on, what depends on it, and how far a change would travel         |
| Adoption      | declaring that this tenant depends on it                                          |
| Subscriptions | which changes to hear about                                                       |
| Notifications | where those changes arrive                                                        |
| Claims        | what the memory believes, with the evidence and confidence behind each statement  |

Two things about this remote that are easy to get wrong:

**Adopting has a server-side side effect that unadopting does not undo.** Adoption
transparently creates an inbox subscription, and unadopting removes only the
adoption row — so the subscription survives and keeps delivering. The confirmation
says so, because a reversible action that quietly leaves something behind is worse
than one that admits it.

**The claims surface renders its safety caveat once, not per row.** Every served
claim is labelled untrusted by construction, so a per-row badge would imply
variance that does not exist and would become chrome the eye stops seeing.
