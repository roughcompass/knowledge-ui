import { StackLayout, Tag, Text } from '@salt-ds/core';
import {
  GRAPH_VOCABULARY_KINDS,
  useCapabilityTypes,
  useEdgePropertySchemas,
  useVocabulary,
  type CapabilityTypeSchema,
  type EdgePropertySchema,
  type RegistryClient,
  type VocabularyValue,
} from '@knowledge-ui/api-client';
import { can, useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  LoadingPanel,
  Note,
  PageHeader,
  SectionCard,
  UnavailableNotice,
  instantText,
  termText,
  type Column,
} from '@knowledge-ui/ui-kit';

/**
 * The ontology: what the graph is allowed to contain.
 *
 * Four reads, all complete in one response — no cursor, no page limit — which is
 * what makes this the one graph surface where a count is a fact rather than a
 * sample.
 *
 * ## The list of kinds is not itself discoverable
 *
 * `GET /v1/admin/vocabularies/{kind}` takes the kind as a path segment and there
 * is **no endpoint that lists the kinds**. So this page asks for the two the
 * graph is built from — `entity_type` and `edge_rel` — and says in as many words
 * that they are a chosen pair. A tenant may hold vocabularies this console never
 * asks for, and nothing in any response would reveal it; presenting these two as
 * "the vocabularies" would be a claim the API cannot support.
 *
 * ## Advisory and enforced are the distinction worth showing
 *
 * A capability-type schema that is advisory describes what a capability of that
 * type should carry and does not refuse a write that ignores it. An enforcing
 * one rejects the write. The two are indistinguishable in a list of type names,
 * and confusing them is how somebody concludes the contextplane validated something
 * it merely recorded — so the flag gets a column of its own rather than a
 * footnote.
 *
 * ## Deprecated values are shown, not filtered
 *
 * A deprecated vocabulary value cannot be used by a new row and is still carried
 * by old ones. Filtering it out would leave a reader unable to explain an
 * existing edge whose relation appears in no list.
 */

export function GraphOntologyPage() {
  const { session, client } = useSession<RegistryClient>();
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const allowed = can(session, 'ontology:read');

  const entityTypes = useVocabulary(client, scope, 'entity_type', { enabled: allowed });
  const edgeRels = useVocabulary(client, scope, 'edge_rel', { enabled: allowed });
  const types = useCapabilityTypes(client, scope, { enabled: allowed });
  const edgeSchemas = useEdgePropertySchemas(client, scope, { enabled: allowed });

  const vocabColumns: Column<VocabularyValue>[] = [
    { key: 'value', header: 'Value' },
    {
      key: 'is_system',
      header: 'Origin',
      render: (row) => (row.is_system ? 'Registry' : 'This tenant'),
    },
    {
      key: 'deprecated_at',
      header: 'Status',
      render: (row) =>
        row.deprecated_at ? (
          <Tag bordered>Deprecated {instantText(row.deprecated_at)}</Tag>
        ) : (
          'In use'
        ),
    },
  ];

  const typeColumns: Column<CapabilityTypeSchema>[] = [
    { key: 'type_name', header: 'Type', render: (row) => termText(row.type_name) },
    {
      key: 'is_advisory',
      header: 'Validation',
      render: (row) => (row.is_advisory ? 'Advisory' : 'Enforced'),
    },
    {
      key: 'required',
      header: 'Required attributes',
      render: (row) => {
        // Read straight out of the served schema. Not a rule this page knows —
        // if the schema names no required attributes, it says so.
        const required = row.json_schema?.required;
        if (!Array.isArray(required) || required.length === 0) {
          return <Text color="secondary">None</Text>;
        }
        return required.map((key) => termText(String(key))).join(', ');
      },
    },
    {
      key: 't_valid_from',
      header: 'In force since',
      render: (row) => instantText(row.t_valid_from),
    },
  ];

  const edgeSchemaColumns: Column<EdgePropertySchema>[] = [
    {
      key: 'rel',
      header: 'Relation',
      render: (row) =>
        row.rel ? termText(String(row.rel)) : <Text color="secondary">Unnamed</Text>,
    },
    {
      key: 'properties',
      header: 'Constrained properties',
      render: (row) => {
        const properties = row.json_schema?.properties;
        if (!properties || typeof properties !== 'object') {
          return <Text color="secondary">None declared</Text>;
        }
        return Object.keys(properties)
          .map((key) => termText(key))
          .join(', ');
      },
    },
  ];

  if (!allowed) {
    return (
      <StackLayout gap={3}>
        <PageHeader title="Ontology" />
        <UnavailableNotice
          title="Ontology"
          reason="The vocabulary and schema endpoints are served under /v1/admin and admit administrators only. This session holds a different role, so these definitions are not readable here."
        />
      </StackLayout>
    );
  }

  const queries = [entityTypes, edgeRels, types, edgeSchemas];
  const failed = queries.find((q) => q.error);

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Ontology"
        description="The definitions the graph is built from: what a node may be, how two entities may be related, and which of those shapes the contextplane enforces."
      />

      {failed?.error ? <ErrorPanel error={failed.error} /> : null}
      {queries.some((q) => q.isLoading) ? <LoadingPanel label="Loading the ontology" /> : null}

      {entityTypes.data ? (
        <SectionCard
          title="Entity types"
          description={`The ${entityTypes.data.length} kinds a node may be.`}
        >
          <DataTable
            columns={vocabColumns}
            rows={entityTypes.data}
            getRowId={(row) => row.vocab_id}
            caption="Entity type vocabulary"
            emptyTitle="No Entity Types Registered"
            emptyDescription="The vocabulary is empty for this tenant. Entity types are administered through the contextplane, not from this console."
            hideCaption
          />
        </SectionCard>
      ) : null}

      {edgeRels.data ? (
        <SectionCard
          title="Edge relations"
          description={`The ${edgeRels.data.length} ways two entities may be related. Deprecated values are listed because existing edges still carry them.`}
        >
          <DataTable
            columns={vocabColumns}
            rows={edgeRels.data}
            getRowId={(row) => row.vocab_id}
            caption="Edge relation vocabulary"
            emptyTitle="No Edge Relations Registered"
            emptyDescription="No relationship kinds are defined for this tenant yet."
            hideCaption
          />
        </SectionCard>
      ) : null}

      {types.data ? (
        <SectionCard
          title="Capability type schemas"
          description="What a capability of each type must carry — and whether the contextplane refuses a write that ignores it."
        >
          <DataTable
            columns={typeColumns}
            rows={types.data}
            getRowId={(row) => row.schema_id}
            caption="Capability type schemas"
            emptyTitle="No Capability Type Schemas"
            emptyDescription="No type carries a schema in this tenant. A capability without one is still valid; its fields are simply unconstrained."
            hideCaption
          />
        </SectionCard>
      ) : null}

      {edgeSchemas.data ? (
        <SectionCard
          title="Edge property schemas"
          description="Relations whose property bag is constrained. A relation absent from this list accepts any properties."
        >
          <DataTable
            columns={edgeSchemaColumns}
            rows={edgeSchemas.data}
            getRowId={(row, index) => String(row.schema_id ?? index)}
            caption="Edge property schemas"
            emptyTitle="No Edge Property Schemas"
            emptyDescription="No relationship kind constrains its properties in this tenant."
            hideCaption
          />
        </SectionCard>
      ) : null}

      <Note label="Two vocabularies, not every vocabulary">
        The vocabulary endpoint takes a kind as a path segment and the API offers no way to list the
        kinds that exist. This page asks for {GRAPH_VOCABULARY_KINDS.map(termText).join(' and ')} —
        the two the graph is built from. Others may exist and would not appear here.
      </Note>
    </StackLayout>
  );
}
