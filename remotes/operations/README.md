# `@knowledge-ui/remote-operations`

The screens for running the service.

| Surface            | Answers                                                                                                    | Gate                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| Health             | is it alive, is it ready, can it reach what it needs                                                       | the section's own       |
| Operational health | queue depths, dead letters, and the data-quality counters that are actionable the moment they are non-zero | admin                   |
| Audit log          | who did what                                                                                               | auditor, by exact match |
| Sync connectors    | the configured sources, and the write path over them                                                       | admin                   |
| Sync runs          | run history, as a sibling destination rather than a detail view                                            | admin                   |

**Three different permissions in one section, deliberately.** The pages are grouped
for the reader's benefit, not because they share a gate: the probes are
unauthenticated, the audit log is the most restricted surface in the API, and the
sync screens are admin-only. So each page that needs more than the section does
gates itself and explains which role would work.

The audit log is the case that forces that explanation. Because the server resolves
a principal to one role by precedence and auditor sits lowest, a principal holding
admin and auditor _loses_ audit access — so being refused here is a normal server
constraint rather than a mistake.

**No screen reads the metrics exposition format, and none names an external
dashboard.** Those numbers are per-replica and cumulative since process start, and
a reader cannot tell; a console whose operations page is a set of links into a tool
that may not be installed is an absent page rather than a degraded one. A guard
enforces both.
