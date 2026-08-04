import { Button, FlexLayout, StackLayout, Tag, Text } from '@salt-ds/core';
import { useCapability, type RegistryClient } from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  SectionCard,
} from '@knowledge-ui/ui-kit';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AdoptionControl } from '../components/AdoptionControl';
import { SubscriptionPanel } from '../components/SubscriptionPanel';

/**
 * One capability in full.
 *
 * The detail resource is where lifecycle, attributes, facts and edges live —
 * none of which the list endpoint returns. It is also where the bitemporal
 * fields live, and those are absent rather than null unless `view=audit` is
 * requested, so the audit tab only renders when it is asked for: a row of
 * em-dashes would imply a null the response never contained.
 */
/**
 * Render an attribute value of unknown shape.
 *
 * `attributes` is `Record<string, unknown>` and the server means it: alongside plain
 * strings it returns objects for bitemporal attributes — `lifecycle: {"state": "beta"}`
 * on real data. `String(value)` turns that into the literal text "[object Object]",
 * which is what this page shipped until it was run against a real registry rather than
 * a fixture of only-strings.
 *
 * Objects and arrays are shown as compact JSON in the mono face, because at that point
 * the value *is* data and pretending otherwise loses it entirely.
 */
function AttributeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text color="secondary">—</Text>;
  if (typeof value === 'object') {
    return <Text styleAs="code">{JSON.stringify(value)}</Text>;
  }
  return <Text>{String(value)}</Text>;
}

export function CapabilityDetailPage() {
  const { handle } = useParams<{ handle: string }>();
  const { session, client } = useSession<RegistryClient>();
  const navigate = useNavigate();
  const [auditView, setAuditView] = useState(false);

  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useCapability(client, scope, handle, {
    include: ['components', 'depends_on', 'external_ids'],
    ...(auditView ? { view: 'audit' as const } : {}),
  });

  const data = (query.data ?? {}) as Record<string, unknown>;
  const entity = (data.entity ?? {}) as Record<string, unknown>;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  const facts = Array.isArray(data.facts) ? (data.facts as Array<Record<string, unknown>>) : [];
  const lifecycle = typeof data.lifecycle === 'string' ? data.lifecycle : undefined;

  const attributeRows = Object.entries(attributes).map(([key, value]) => ({ key, value }));

  /*
   * The header renders in every state, including while the request is in flight.
   * Returning `LoadingPanel` in place of the whole page took the title with it, so
   * clicking a row appeared to navigate somewhere blank before the page snapped
   * into existence — and on an error the reader was left with no indication of
   * which capability had failed.
   *
   * The name is only known once the response lands; until then the URL handle is
   * the honest title, and it is what the reader clicked.
   */
  const header = (
    <PageHeader
      title={String(entity.name ?? handle ?? 'Capability')}
      metadata={
        query.isPending ? undefined : (
          <FlexLayout gap={1} align="center">
            {lifecycle ? <Tag>{lifecycle}</Tag> : null}
            <Tag>{String(entity.entity_type ?? 'capability')}</Tag>
          </FlexLayout>
        )
      }
      actions={
        <FlexLayout gap={1} align="center">
          {/*
            First action, because declaring a dependency is the reason a consumer
            came here. It renders its own pending and error states rather than
            being hidden behind the page's, since the page has already loaded by
            the time this matters.
          */}
          {handle ? <AdoptionControl handle={handle} /> : null}
          <Button
            appearance={auditView ? 'solid' : 'bordered'}
            sentiment="neutral"
            disabled={query.isPending}
            onClick={() => setAuditView((v) => !v)}
          >
            {auditView ? 'Hide bitemporal fields' : 'Show bitemporal fields'}
          </Button>
          <Button appearance="bordered" sentiment="neutral" onClick={() => navigate('..')}>
            Back
          </Button>
        </FlexLayout>
      }
    />
  );

  if (query.isPending)
    return (
      <StackLayout gap={3}>
        {header}
        <LoadingPanel label="Loading capability" />
      </StackLayout>
    );

  if (query.error)
    return (
      <StackLayout gap={3}>
        {header}
        <ErrorPanel error={query.error} title="Could not load this capability" />
      </StackLayout>
    );

  return (
    <StackLayout gap={3}>
      {header}

      {/*
        Above Attributes because it is actionable and they are reference. A reader
        who came to decide whether to depend on this capability acts here; a reader
        who came to look something up scrolls past.
      */}
      {handle ? <SubscriptionPanel handle={handle} /> : null}

      <SectionCard title="Attributes" banded flush>
        <DataTable
          caption="Attributes"
          hideCaption
          columns={[
            { key: 'key', header: 'Key' },
            { key: 'value', header: 'Value', render: (row) => <AttributeValue value={row.value} /> },
          ]}
          rows={attributeRows}
          getRowId={(row) => row.key}
          emptyTitle="No attributes"
          emptyHeadingLevel="h3"
        />
      </SectionCard>

      <SectionCard title="Facts" banded flush>
        <DataTable
          caption="Facts"
          hideCaption
          zebra
          columns={[
            {
              key: 'category',
              header: 'Category',
              render: (row) => <Tag>{String(row.category)}</Tag>,
            },
            { key: 'body', header: 'Body', render: (row) => <Text>{String(row.body)}</Text> },
          ]}
          rows={facts}
          // Facts are not guaranteed an id, so the index is the fallback. It is
          // passed by `DataTable` — this used to declare it as a defaulted
          // parameter that never received a value, keying every id-less fact "0".
          getRowId={(row, index) => String(row.fact_id ?? index)}
          emptyTitle="No facts recorded"
          emptyHeadingLevel="h3"
        />
      </SectionCard>

      {auditView ? (
        <SectionCard
          title="Audit fields"
          description="Omitted from the response entirely unless requested, so an empty table here means the server sent nothing — not that the values are null. Valid-time intervals are not among them: those belong to individual facts and edges, which are the rows that assert something that can later stop being true. An entity has a creation time and an active flag, and both are shown here."
        >
          <DataTable
            caption="Bitemporal fields"
            hideCaption
            columns={[
              { key: 'key', header: 'Field' },
              {
                key: 'value',
                header: 'Value',
                render: (row) => <AttributeValue value={row.value} />,
              },
            ]}
            rows={['tenant_id', 'is_active', 'superseded_facts_count', 'as_of']
              .filter((key) => key in data)
              .map((key) => ({ key, value: data[key] ?? '\u2014' }))}
            getRowId={(row) => row.key}
            emptyTitle="No audit fields returned"
            emptyHeadingLevel="h3"
          />
        </SectionCard>
      ) : null}
    </StackLayout>
  );
}
