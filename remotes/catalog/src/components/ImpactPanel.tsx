import { Dropdown, FlexLayout, Option, StackLayout, Tag, Text } from '@salt-ds/core';
import {
  TRAVERSAL_DEPTHS,
  edgesByRelationship,
  traversalCaveats,
  useBlastRadius,
  useDependencies,
  useDependents,
  type Dependencies,
  type EdgeRef,
  type RegistryClient,
  type Traversal,
  type TraversalDepth,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterBar,
  FilterField,
  LoadingPanel,
  SectionCard,
  UnavailableNotice,
  popoverOverlayProps,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';

/**
 * What a change to this capability would reach.
 *
 * Three questions over the same graph, and which one a reader wants depends
 * entirely on why they came:
 *
 * - **Depends on** — what this capability needs. Read before building on it.
 * - **Used by** — who needs this capability. Read before changing it.
 * - **Blast radius** — the transitive closure. Read before a breaking change.
 *
 * One panel with a selector rather than three stacked cards, because they answer
 * alternatives rather than parts of one answer: a reader wants one at a time, and
 * stacking would make the page long enough that the third is never seen. Only the
 * selected traversal is requested, so the other two cost nothing — and the closure
 * is the expensive one, which should not be the price of opening a capability.
 *
 * ## The controls are dropdowns because every other selector here is
 *
 * Written first as two rows of toggle buttons, which is precisely the deviation
 * this app has already been corrected for once: a second idiom for the same job
 * is what makes a console read as assembled rather than designed. Filters and
 * selectors here are a bordered `Dropdown` inside a `FilterField`, so these are
 * too.
 *
 * ## The list is the primary rendering, not a fallback for a diagram
 *
 * A graph drawn here would need its data table beside it anyway — that pairing is
 * a hard requirement, not a preference — and the table is what a reader can
 * search, copy, and paste into a change request. So edges are grouped by
 * relationship and listed. Grouping is what makes forty edges readable, and it is
 * the grouping a reader would otherwise do in their head.
 *
 * ## A partial answer says so
 *
 * A closure served from cache may miss an edge written moments ago, and a
 * traversal that could not resolve a version constraint has reported edges whose
 * version agreement is unknown. Both are stated above the table rather than
 * dropped, because the reader most likely to be here is the one deciding whether
 * to ship a breaking change — the one person who must not be told a partial
 * answer is complete.
 */

type Question = 'dependencies' | 'dependents' | 'blast-radius';

const QUESTIONS: ReadonlyArray<{ id: Question; label: string; hint: string }> = [
  {
    id: 'dependents',
    label: 'Used by',
    hint: 'Who needs this capability. Read this before changing it.',
  },
  {
    id: 'dependencies',
    label: 'Depends on',
    hint: 'What this capability needs. Read this before building on it.',
  },
  {
    id: 'blast-radius',
    label: 'Blast radius',
    hint: 'Everything a change here could reach, transitively.',
  },
];

const LABELS: Record<Question, string> = {
  dependents: 'Used by',
  dependencies: 'Depends on',
  'blast-radius': 'Blast radius',
};

/**
 * Whether a response is a full traversal rather than a plain dependency list.
 *
 * Only the traversal endpoints report `cache_hit` and `version_satisfied`, so only
 * they have caveats to relay. A written-out guard rather than an `in` check
 * because the two response types are structurally close enough that narrowing by
 * key does not hold, and silently widening to the looser type is how the caveats
 * would stop being rendered without anything failing.
 */
function isTraversal(data: Dependencies | Traversal): data is Traversal {
  return 'cache_hit' in data && 'version_satisfied' in data;
}

function EdgeGroups({ edges }: { edges: readonly EdgeRef[] }) {
  const grouped = [...edgesByRelationship(edges).entries()];

  if (grouped.length === 0) {
    /*
     * Three things could produce an empty result and they are not the same: this
     * capability genuinely has no relationships, its relationships belong to a
     * tenant the reader cannot see, or none exist at this depth. The copy names
     * the second, because it is the one a reader would otherwise mistake for the
     * first and act on.
     */
    return (
      <EmptyState
        title="Nothing Connected at This Depth"
        description="No edges the current identity can see. A capability with no relationships is not the same as one whose relationships are private to another tenant, and this view cannot tell you which — try a greater depth before concluding it stands alone."
        headingLevel="h3"
      />
    );
  }

  return (
    <StackLayout gap={2}>
      {grouped.map(([relationship, group]) => (
        <StackLayout gap={1} key={relationship}>
          <FlexLayout gap={1} align="center">
            <Text styleAs="label">{relationship}</Text>
            <Tag>{String(group.length)}</Tag>
          </FlexLayout>
          <DataTable
            caption={`Edges of type ${relationship}`}
            hideCaption
            columns={[
              { key: 'dst_entity_id', header: 'Entity' },
              {
                key: 'valid_from',
                header: 'Valid From',
                render: (row) => (
                  <Text color="secondary">{row.valid_from ? String(row.valid_from) : '—'}</Text>
                ),
              },
            ]}
            rows={[...group]}
            getRowId={(row) => row.edge_id}
            emptyTitle="No edges"
            emptyHeadingLevel="h3"
          />
        </StackLayout>
      ))}
    </StackLayout>
  );
}

export function ImpactPanel({ handle }: { handle: string }) {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const [question, setQuestion] = useState<Question>('dependents');
  const [depth, setDepth] = useState<TraversalDepth>(1);

  const allowed = can(session, 'impact:read');
  const asked = (of: Question) => (allowed && question === of ? handle : undefined);

  const dependencies = useDependencies(client, scope, asked('dependencies'), { depth });
  const dependents = useDependents(client, scope, asked('dependents'), { depth });
  const blastRadius = useBlastRadius(client, scope, asked('blast-radius'), { depth });

  const active =
    question === 'dependencies'
      ? dependencies
      : question === 'dependents'
        ? dependents
        : blastRadius;

  const hint = QUESTIONS.find((q) => q.id === question)?.hint;

  if (!allowed) {
    return (
      <UnavailableNotice
        title="Impact traversal is not available to this role"
        reason="Walking dependencies needs a tenant context this identity does not carry, so the graph is not requested."
      />
    );
  }

  const caveats = active.data && isTraversal(active.data) ? traversalCaveats(active.data) : [];

  return (
    <SectionCard title="Impact" description={hint}>
      <StackLayout gap={2}>
        <FilterBar label="Impact traversal">
          <FilterField label="Question" basis="14rem">
            <Dropdown
              bordered
              value={LABELS[question]}
              onSelectionChange={(_e, selected) =>
                setQuestion((selected?.[0] as Question) ?? 'dependents')
              }
              OverlayProps={popoverOverlayProps}
            >
              {QUESTIONS.map((q) => (
                <Option key={q.id} value={q.id}>
                  {q.label}
                </Option>
              ))}
            </Dropdown>
          </FilterField>

          <FilterField label="Depth" basis="8rem">
            <Dropdown
              bordered
              value={String(depth)}
              onSelectionChange={(_e, selected) =>
                setDepth((Number(selected?.[0]) as TraversalDepth) ?? 1)
              }
              OverlayProps={popoverOverlayProps}
            >
              {TRAVERSAL_DEPTHS.map((d) => (
                <Option key={d} value={String(d)}>
                  {String(d)}
                </Option>
              ))}
            </Dropdown>
          </FilterField>
        </FilterBar>

        {caveats.length > 0 ? (
          <StackLayout gap={1}>
            {caveats.map((caveat) => (
              <Text color="secondary" key={caveat}>
                {caveat}
              </Text>
            ))}
          </StackLayout>
        ) : null}

        {active.isPending ? <LoadingPanel label={`Walking ${LABELS[question]}`} /> : null}

        {active.error ? <ErrorPanel error={active.error} title="Could not walk the graph" /> : null}

        {active.data ? <EdgeGroups edges={active.data.edges} /> : null}
      </StackLayout>
    </SectionCard>
  );
}
