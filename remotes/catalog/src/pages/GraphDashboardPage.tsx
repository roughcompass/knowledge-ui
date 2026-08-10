import { Button, StackLayout, Text, Tooltip } from '@salt-ds/core';
import { can, refusalSuggestion, useSession, type Session } from '@knowledge-ui/auth';
import {
  useCapabilityTypes,
  useEdgePropertySchemas,
  useGraphProjection,
  useVocabulary,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import {
  ErrorPanel,
  Note,
  PageHeader,
  SectionCard,
  StatTile,
  TileGrid,
  UnavailableNotice,
  KLink,
} from '@knowledge-ui/ui-kit';

/**
 * The graph dashboard: what shape the graph has, and what it refuses to say.
 *
 * ## The number this page cannot show
 *
 * The obvious dashboard is a row of totals — entities, edges, triples. **The
 * contextplane publishes none of them.** There is no `/v1/stats`, no
 * `/v1/graph/summary`, and the two projection endpoints return `nodes`, `edges`
 * and `next_cursor` with no `total` on the envelope. The only way to produce a
 * total here would be to page the whole graph in the browser and count what came
 * back, which measures how many pages this page happened to fetch rather than
 * how large the graph is — and would go quietly wrong the moment a cursor
 * expired or a page limit changed.
 *
 * So the totals are a named absence rather than a plausible number. That is the
 * whole point of the notice at the bottom: a reader who wants a triple count
 * leaves knowing the contextplane does not offer one, instead of leaving with a
 * figure that was never true.
 *
 * ## What it shows instead, and why each is honest
 *
 * **The ontology, counted.** The vocabulary, capability-type and edge-schema
 * endpoints each return the *complete* set in a single unpaged array — no
 * cursor, no limit. Counting those is reporting the response, not extrapolating
 * from a sample, so "eight edge relations are defined" is a fact. These are
 * counts of *definitions*: how many kinds of thing may exist, never how many do.
 *
 * **The projections, as pages.** The first page of what this tenant ships and
 * what it consumes, described as a page in those words and paired with whether
 * more follows. A reader can see the graph's texture — that capabilities depend
 * on platform services, that some nodes are retired — without being told a size.
 *
 * ## Two capabilities, because the server draws two lines
 *
 * The projections admit every role; the ontology is admin-only. A dashboard that
 * gated the whole page on the stricter of the two would hide the half that three
 * roles may read, and one that gated on the looser would offer an admin screen
 * to a consumer and collect a 403. So the panels are gated independently and the
 * ontology half names its own absence for a reader who cannot see it.
 */

/** The heading and the reason for each half, kept beside the panel they title. */
function OntologyPanel({ session, client }: { session: Session; client: RegistryClient }) {
  const { personas, onSwitchPersona } = useSession();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'ontology:read');

  const entityTypes = useVocabulary(client, scope, 'entity_type', { enabled: allowed });
  const edgeRels = useVocabulary(client, scope, 'edge_rel', { enabled: allowed });
  const types = useCapabilityTypes(client, scope, { enabled: allowed });
  const edgeSchemas = useEdgePropertySchemas(client, scope, { enabled: allowed });

  if (!allowed) {
    /*
      The same suggestion the route guard computes, so this refusal names the
      same roles and only ever offers a persona that would succeed. The title is
      required for assistive technology but visually hidden: the enclosing card
      is already titled "Ontology", and a third repeat in ninety pixels is where
      the eye stops reading any of them.
    */
    const { grantingRoles, persona } = refusalSuggestion('ontology:read', personas);
    return (
      <UnavailableNotice
        title="Ontology"
        hideTitle
        reason={`The projections below read with your current role. These definitions need ${grantingRoles
          .map((role) => `the ${role} role`)
          .join(' or ')}.`}
        action={
          persona && onSwitchPersona ? (
            <Button sentiment="accented" onClick={() => onSwitchPersona(persona.key)}>
              Switch to {persona.label}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const queries = [entityTypes, edgeRels, types, edgeSchemas];
  const failed = queries.find((q) => q.error);
  if (failed?.error) return <ErrorPanel error={failed.error} />;
  /*
    No pending branch: every tile's label is declared below, so the row renders at
    once and each tile bars its own reading. What a tile is about is known before
    the count is, and a row of labelled tiles says more while loading than a
    spinner does — and the grid does not resize when the counts arrive.
  */
  const ontologyPending = queries.some((q) => q.isLoading);

  /*
   * Counting is safe here and nowhere else on this page: each of these endpoints
   * returns its complete set in one array, with no cursor and no page limit. The
   * length of the response *is* the number defined.
   */
  const liveEdgeRels = (edgeRels.data ?? []).filter((v) => !v.deprecated_at);
  const deprecatedEdgeRels = (edgeRels.data ?? []).length - liveEdgeRels.length;

  return (
    <StackLayout gap={2}>
      <TileGrid columns={2}>
        <StatTile
          isLoading={ontologyPending}
          label="Entity types"
          value={(entityTypes.data ?? []).length}
          hint="Kinds a node may be."
          headingLevel="h3"
        />
        <StatTile
          isLoading={ontologyPending}
          label="Edge relations"
          value={liveEdgeRels.length}
          hint={
            deprecatedEdgeRels > 0
              ? `In use. ${deprecatedEdgeRels} ${deprecatedEdgeRels === 1 ? 'is' : 'are'} deprecated and still referenced by existing edges.`
              : 'Ways two entities may be related.'
          }
          headingLevel="h3"
        />
        <StatTile
          isLoading={ontologyPending}
          label="Capability type schemas"
          value={(types.data ?? []).length}
          hint={`${(types.data ?? []).filter((t) => !t.is_advisory).length} enforced, the rest advisory.`}
          headingLevel="h3"
        />
        <StatTile
          isLoading={ontologyPending}
          label="Edge property schemas"
          value={(edgeSchemas.data ?? []).length}
          hint="Relations whose property bag is constrained."
          headingLevel="h3"
        />
      </TileGrid>
      <Note label="What these count">
        Definitions, not instances. A count of entity types is how many things a node may be — not
        how many exist. The contextplane serves no count of what exists.
      </Note>
    </StackLayout>
  );
}

function ProjectionPanel({
  session,
  client,
  direction,
  title,
  description,
}: {
  session: Session;
  client: RegistryClient;
  direction: 'provider' | 'consumer';
  title: string;
  description: string;
}) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useGraphProjection(client, scope, direction);

  if (query.error) return <ErrorPanel error={query.error} />;

  const nodes = query.data?.nodes ?? [];
  const edges = query.data?.edges ?? [];
  const more = Boolean(query.data?.next_cursor);

  return (
    <SectionCard title={title} description={description} headingLevel="h3">
      <StackLayout gap={2}>
        <TileGrid columns={2}>
          {/*
            Labelled "on this page" in the label itself rather than in a footnote.
            A tile reading "Entities 20" beside a graph of unknown size is read as
            a total by everyone who does not read the footnote.
          */}
          <StatTile
            isLoading={query.isLoading}
            label="Entities on the first page"
            value={nodes.length}
            hint={more ? 'More follow.' : 'This is the whole projection.'}
            headingLevel="h3"
          />
          <StatTile
            isLoading={query.isLoading}
            label="Edges on the first page"
            value={edges.length}
            hint="Edges whose source is one of the entities above."
            headingLevel="h3"
          />
        </TileGrid>
        <Text>
          <KLink to="projections">Open the projections</KLink> to page through the rest.
        </Text>
      </StackLayout>
    </SectionCard>
  );
}

export function GraphDashboardPage() {
  const { session, client } = useSession<RegistryClient>();
  const canReadOntology = can(session, 'ontology:read');

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Graph"
        description="How the catalog is connected: the ontology that constrains the graph, and the projections of what this tenant ships and consumes."
      />

      <SectionCard
        title="Ontology"
        description="The definitions the graph is built from — what a node may be, how two entities may be related, and which of those shapes are enforced."
        actions={
          canReadOntology ? (
            <KLink to="ontology">Ontology Detail</KLink>
          ) : (
            /*
              Gated on the same capability as the page it opens. Ungated, the
              action walks a consumer straight into a refusal — an invitation to
              a door that does not open is worse than a visibly locked door.
            */
            <Tooltip content="The ontology detail page needs the admin role.">
              <Button appearance="transparent" sentiment="neutral" disabled focusableWhenDisabled>
                Ontology Detail
              </Button>
            </Tooltip>
          )
        }
      >
        <OntologyPanel session={session} client={client} />
      </SectionCard>

      <SectionCard
        title="Projections"
        // The unstated half — the two directions are two endpoints, each paged
        // by cursor — is machinery; what a reader needs is that these are first
        // pages and the contextplane does not say how much follows.
        description="The first page of each projection. More may follow, and the contextplane does not say how much."
      >
        <StackLayout gap={3}>
          <ProjectionPanel
            session={session}
            client={client}
            direction="provider"
            title="What this tenant ships"
            description="Entities this tenant publishes, and the dependencies that originate in them."
          />
          <ProjectionPanel
            session={session}
            client={client}
            direction="consumer"
            title="What this tenant consumes"
            description="Entities something in this tenant depends on."
          />
        </StackLayout>
      </SectionCard>

      {/*
        The absence is a first-class panel rather than a caveat in small print,
        because "how big is the graph" is the first question a dashboard invites
        and the answer is that the contextplane does not say.
      */}
      <UnavailableNotice
        title="Graph totals"
        // Quiet: this is a permanent limit of the API, identical for every reader,
        // with no next step behind it. A blue banner promises something to do.
        tone="quiet"
        reason="No endpoint counts the graph. There is no entity total, no edge total and no triple count anywhere in the API, and the projection responses carry a cursor with no total beside it. A figure here would have to be assembled from however many pages this screen fetched, which would describe the fetching rather than the graph."
        tracking="Reaching the ontology counts above is different: those endpoints return their complete set in one response, so counting them reports what was served."
      />
    </StackLayout>
  );
}
