import {
  Button,
  FlexLayout,
  StackLayout,
  Tab,
  TabBar,
  TabList,
  TabTrigger,
  Tabs,
  Text,
} from '@salt-ds/core';
import { useCapability, type RegistryClient } from '@knowledge-ui/api-client';
import { useSession } from '@knowledge-ui/auth';
import {
  DataTable,
  DescriptionList,
  displayText,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  SectionCard,
  StatusLabel,
  termText,
  Note,
} from '@knowledge-ui/ui-kit';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { AdoptionControl } from '../components/AdoptionControl';
import { ImpactPanel } from '../components/ImpactPanel';
import { SubscriptionPanel } from '../components/SubscriptionPanel';
import { InterfacePanel } from './capability/InterfacePanel';

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
 * which is what this page shipped until it was run against a real contextplane rather than
 * a fixture of only-strings.
 *
 * A bitemporal wrapper carrying a single `state` is unwrapped to the state, because
 * `{"state":"ga"}` on screen is storage shape leaking into the product: the reader is
 * shown a JSON literal and left to parse it. This reads a field the response actually
 * sent rather than inferring one — the value is the server's, only the braces are
 * dropped. Anything else object-shaped is still shown as compact JSON, because at that
 * point the value *is* data and prettifying it would lose part of it.
 */
function AttributeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text color="secondary">—</Text>;

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const state = record.state;
    if (typeof state === 'string' && Object.keys(record).length === 1) {
      return <Text>{termText(state)}</Text>;
    }
    return <Text styleAs="code">{JSON.stringify(value)}</Text>;
  }

  return <Text>{displayText(value)}</Text>;
}

/**
 * The order a reader wants these fields in, and the labels they would use.
 *
 * The response is an object, and object key order is whatever the serializer felt
 * like — which put `display_name` third and `lifecycle` last on a page whose whole
 * job is to say what this thing is. Keys the contextplane has never sent are not listed;
 * they fall through to the alphabetical tail below with their key title-cased, which
 * is the honest treatment of a field this app has never seen.
 */
const ATTRIBUTE_ORDER = ['owner', 'tier', 'lifecycle', 'display_name'] as const;

function attributeRank(key: string): number {
  const index = ATTRIBUTE_ORDER.indexOf(key as (typeof ATTRIBUTE_ORDER)[number]);
  return index === -1 ? ATTRIBUTE_ORDER.length : index;
}

/** The body of the `overview` fact, which is the one-line answer to "what is this". */
function overviewOf(facts: ReadonlyArray<Record<string, unknown>>): string | undefined {
  const overview = facts.find((fact) => fact.category === 'overview');
  return typeof overview?.body === 'string' ? overview.body : undefined;
}

/** The tab segments this page defines. Anything else in the URL is a dead address. */
const TAB_VALUES = ['overview', 'interface', 'impact', 'record'] as const;

export function CapabilityDetailPage() {
  const { handle } = useParams<{ handle: string; tab: string }>();
  const { session, client } = useSession<RegistryClient>();
  const navigate = useNavigate();
  /*
    The record fields are a tab now, not a toggle. A control that reveals a panel
    further down the same page is a second idiom for what tabs already do, and it
    left the reader's position in the page dependent on state no link could carry.
  */
  const { tab: tabParam } = useParams<{ tab: string }>();
  const auditView = tabParam === 'record';
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? undefined;

  /*
    Time travel, from the URL.

    Four endpoints accept `as_of` and three hooks already take the parameter; no page
    passed it, so a capability's history was reachable by the API and not by anyone
    reading the console. It lives in the query string because a past view is exactly
    the kind of thing a colleague is sent a link to.
  */
  const asOf = searchParams.get('as_of') ?? undefined;

  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useCapability(client, scope, handle, {
    include: ['components', 'depends_on', 'external_ids'],
    ...(auditView ? { view: 'audit' as const } : {}),
    ...(asOf ? { asOf } : {}),
  });

  /*
   * A tab segment this page does not define redirects to the overview rather
   * than rendering four unselected tabs above an empty body. The URL is a link
   * someone was sent, so it has to land somewhere readable — and `replace`
   * keeps the dead address out of the back stack.
   */
  if (handle && tabParam && !TAB_VALUES.some((value) => value === tabParam)) {
    const search = searchParams.toString();
    return (
      <Navigate to={{ pathname: `../${handle}`, search: search ? `?${search}` : '' }} replace />
    );
  }

  const data = query.data ?? {};
  const entity = (data.entity ?? {}) as Record<string, unknown>;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  const facts = Array.isArray(data.facts) ? (data.facts as Array<Record<string, unknown>>) : [];
  const lifecycle = typeof data.lifecycle === 'string' ? data.lifecycle : undefined;

  const attributeRows = Object.entries(attributes)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => attributeRank(a.key) - attributeRank(b.key) || a.key.localeCompare(b.key));

  /*
   * The name a person would say, when the server sent one. A reader arrives having
   * clicked "Salt Design System" in a search result or having been sent the link by
   * a colleague who called it that; titling the page `salt-design-system` and filing
   * the real name three panels down as a row in a key/value block made them confirm
   * they were in the right place by reading the URL.
   *
   * The slug is not dropped — it is the handle in every API call, every dependency
   * edge and every `package.json`, so it stays on screen as metadata beside the tags.
   */
  const displayName =
    typeof attributes.display_name === 'string' ? attributes.display_name : undefined;
  const slug = displayText(entity.name ?? handle ?? '');
  const overview = overviewOf(facts);

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
      eyebrow="Capability catalog"
      title={displayName ?? slug ?? 'Capability'}
      // The one sentence the reader came for, at the top instead of at the bottom.
      // Absent when the capability has no overview fact — an empty line here would
      // be this page inventing a summary the contextplane never wrote.
      description={overview}
      metadata={
        query.isPending ? undefined : (
          <FlexLayout gap={1} align="center">
            {lifecycle ? (
              <StatusLabel
                status={
                  lifecycle === 'ga'
                    ? 'success'
                    : lifecycle === 'deprecated' || lifecycle === 'retired'
                      ? 'warning'
                      : 'info'
                }
              >
                {termText(lifecycle)}
              </StatusLabel>
            ) : null}
            <Text styleAs="notation" color="secondary">
              {termText(displayText(entity.entity_type ?? 'capability'))}
            </Text>
            {/*
              Shown whenever it is not already the title, so the handle a reader
              needs for an import or an API call is always on the page.
            */}
            {displayName ? (
              <Text styleAs="code" color="secondary">
                {slug}
              </Text>
            ) : null}
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
          {/*
            No writing against a past view. Adopting from a historical read would
            record a decision made about a state that is not current, and the reader
            has no way to see that from the control itself — so the control goes away
            and the notice below says why. Offering a write here would be worse than
            not offering time travel at all.
          */}
          {handle && !asOf ? <AdoptionControl handle={handle} /> : null}
          {/*
            Carries the search back with it. This was `navigate('..')`, which dropped
            the query, the lifecycle filter and the type filter — so a reader who
            arrived from a filtered search returned to an unfiltered browse and had
            to rebuild it. The list writes its own state into `from` when it links
            here, and this hands it back.
          */}
          <Button
            appearance="bordered"
            sentiment="neutral"
            onClick={() => navigate({ pathname: '..', search: from ? `?${from}` : '' })}
          >
            Back to Catalog
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

  /*
   * Views of one capability, as routed tabs.
   *
   * The page was a single column that ran impact, then attributes, then every fact,
   * then subscriptions, then optionally the record fields — so the answer to "what
   * is its contract" and "who depends on it" were separated by a table that can run
   * to hundreds of rows. Tabs are the right idiom precisely because these are views
   * of one thing rather than navigation between things.
   *
   * The tab is a path segment rather than click state, for the same reason the rail
   * derives from the route: a tab a colleague cannot be sent a link to is a tab that
   * does not exist for them. It also means the accessibility and copy sweeps can
   * visit each one.
   */
  const tab = tabParam ?? 'overview';

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'interface', label: 'Interface' },
    { value: 'impact', label: 'Impact' },
    { value: 'record', label: 'Record' },
  ] as const;

  return (
    <StackLayout gap={3}>
      {header}

      <Tabs
        value={tab}
        onChange={(_event, value) => navigate(value === 'overview' ? '.' : `../${handle}/${value}`)}
      >
        <TabBar>
          <TabList>
            {tabs.map((entry) => (
              <Tab key={entry.value} value={entry.value}>
                <TabTrigger>{entry.label}</TabTrigger>
              </Tab>
            ))}
          </TabList>
        </TabBar>
      </Tabs>

      {asOf ? (
        <Note label="Historical view" variant="warning">
          {`Showing this capability as it stood at ${asOf}. Write controls are hidden, because a decision recorded against a past state would not say that it was. Remove the as_of parameter to return to the current view.`}
        </Note>
      ) : null}

      {tab === 'impact' && handle ? <ImpactPanel handle={handle} /> : null}
      {/*
        The recorded `interface` attribute rides along from the detail response
        already in hand, so the panel can answer "what is the contract" when the
        interface endpoint carries no canonical text — without a second fetch.
      */}
      {tab === 'interface' && handle ? (
        <InterfacePanel handle={handle} recordedInterface={attributes.interface} />
      ) : null}

      {tab === 'overview' ? (
        <>
          {/*
        A description list rather than a two-column table, which is what this was. A
        table claims its rows are comparable, and these are one heterogeneous set of
        fields about one capability — there is nothing to scan down a column of
        values, and headers reading "Key" and "Value" invited a reader to try.
      */}
          <SectionCard
            title="Details"
            description="The attributes recorded against this capability."
            banded
          >
            {attributeRows.length === 0 ? (
              <Text color="secondary">No attributes recorded for this capability.</Text>
            ) : (
              <DescriptionList
                caption="Details"
                hideCaption
                items={attributeRows.map((row) => ({
                  // The key title-cased into the term a reader would use. The datum is
                  // the value beside it and is untouched; only the field *name* is
                  // rewritten, and `owner` was never a word the contextplane expected back.
                  term: termText(row.key),
                  detail: <AttributeValue value={row.value} />,
                }))}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Facts"
            description="Statements recorded about this capability, by category. The overview above is one of them."
            banded
            flush
          >
            <DataTable
              caption="Facts"
              hideCaption
              zebra
              columns={[
                {
                  key: 'category',
                  header: 'Category',
                  render: (row) => <Text>{termText(String(row.category))}</Text>,
                },
                { key: 'body', header: 'Body', render: (row) => <Text>{String(row.body)}</Text> },
              ]}
              rows={facts}
              // Facts are not guaranteed an id, so the index is the fallback. It is
              // passed by `DataTable` — this used to declare it as a defaulted
              // parameter that never received a value, keying every id-less fact "0".
              getRowId={(row, index) => displayText(row.fact_id ?? index)}
              emptyTitle="No facts recorded"
              emptyHeadingLevel="h3"
            />
          </SectionCard>

          {/*
        Below identity and impact, not above them. This is a personal preference
        about a mailbox; it was the first thing under the title, so a reader who
        arrived asking "what is this and who depends on it" met a subscription
        control before either answer.
      */}
          {handle ? <SubscriptionPanel handle={handle} /> : null}
        </>
      ) : null}

      {tab === 'record' ? (
        <SectionCard
          title="Record fields"
          description="The contextplane's own record-keeping: who the row belongs to, whether it is still active, and when it was read. Omitted from the response entirely unless requested, so an empty table here means the server sent nothing — not that the values are null. Valid-time intervals are not among them: those belong to individual facts and edges, which are the rows that assert something that can later stop being true."
        >
          <DescriptionList
            caption="Record fields"
            hideCaption
            items={['tenant_id', 'is_active', 'superseded_facts_count', 'as_of']
              .filter((key) => key in data)
              .map((key) => ({
                term: termText(key),
                detail: <AttributeValue value={data[key] ?? '\u2014'} />,
              }))}
          />
        </SectionCard>
      ) : null}
    </StackLayout>
  );
}
