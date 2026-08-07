import { FlexLayout, FlowLayout, StackLayout, Tag, Text } from '@salt-ds/core';
import { useEffect, useState } from 'react';
import {
  describeWindow,
  useNotifications,
  useOperationalHealth,
  useOwnedCapabilityUsage,
  useUsageSummary,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { can, capabilitiesFor, type Persona, type Session } from '@knowledge-ui/auth';
import {
  DataTable,
  ErrorPanel,
  NavCard,
  Note,
  PageHeader,
  Prose,
  SectionCard,
  StatTile,
  TileGrid,
  instantText,
  isoDay,
  KLink,
} from '@knowledge-ui/ui-kit';
import { useHref, useNavigate } from 'react-router-dom';

import { NAVIGATION, remoteChildHref, type NavigationSection } from '../remotes/registry';

/** The probe's three host-visible states, as a reader would say them. */
const READINESS_TEXT = {
  ready: 'Ready',
  'not-ready': 'Not ready',
  unknown: 'Unknown',
} as const;

/**
 * `info` rather than `warning` for the unknown case: not having heard back is not
 * a finding about the service, and colouring it as one would report a fault the
 * probe never observed.
 */
const READINESS_STATUS = {
  ready: 'success',
  'not-ready': 'error',
  unknown: 'info',
} as const;

/**
 * The landing page: what this is, where to go, what arrived, then who you are.
 *
 * ## Orient and dispatch, in that order
 *
 * A landing page has thirty seconds to answer "what is this and where do I go".
 * This one used to open with three tiles reading Service, Signed in as and Role
 * — session reference material, above the destinations somebody actually came
 * for, and two-thirds of it already visible in the rail badge and the persona
 * switcher. A reader arriving cold read their own name before they read what the
 * product was for.
 *
 * So the destinations come first, then the feed, and every fact about the session
 * is gathered at the bottom under "Your access", which is where reference belongs.
 * The one exception is service readiness, which is not reference: an amber probe
 * changes how much to trust everything below it, so it stays visible near the top.
 *
 * **Nothing here is counted.** The list endpoints serve a page and a cursor, not
 * a total, so a tile reading "42 capabilities" could only mean "42 on the first
 * page" — a number that changes with the page size and reads as inventory.
 *
 * The one panel that varies by role is "What you publish", and it varies because
 * the *data* does: the owner-scoped usage read only returns rows to a session
 * that owns capabilities. Navigation, layout and section order are identical for
 * every role, because a product whose shape changes with the reader is a product
 * nobody can be taught or supported on — and the persona switcher means one
 * person sees all four in a minute.
 */
export function DashboardPage({
  session,
  personas,
  client,
  readiness,
}: {
  session: Session;
  personas: readonly Persona[];
  client: RegistryClient;
  /**
   * Passed down rather than probed again. The host already runs this query to
   * light the header's status dot; asking for it a second time here would put
   * two owners on one piece of state for no gain.
   */
  readiness: 'ready' | 'not-ready' | 'unknown';
}) {
  const navigate = useNavigate();
  const available = NAVIGATION.filter((section) => can(session, section.need));
  const unavailable = NAVIGATION.filter((section) => !can(session, section.need));
  const auditorPersona = personas.find((p) => p.expectedRole === 'auditor');

  return (
    <StackLayout gap={3}>
      <PageHeader
        title="Capability Registry"
        description="Everything a team at this bank publishes for other teams to build on — what exists, who depends on it, and how much it is used. Search from the bar above, or start with a section below."
        metadata={
          <FlexLayout gap={1} wrap>
            <Tag bordered>{session.tenantDisplayName}</Tag>
            <Tag bordered>{session.role}</Tag>
          </FlexLayout>
        }
      />

      {/*
        Readiness alone, and only when it is not ready.
        ----------------------------------------------
        The other two tiles that stood here — the actor and the role — are on
        screen already, in the rail badge and the persona switcher, and neither
        changes what a reader should do next. This one does: a failing dependency
        means every panel below may be stale or empty for a reason that has
        nothing to do with the catalog. Silent while healthy, because a green tile
        reporting the expected state every single visit is the definition of
        chrome the eye stops seeing.
      */}
      {readiness !== 'ready' ? (
        <Note
          label={`Service ${READINESS_TEXT[readiness].toLowerCase()}`}
          variant={readiness === 'not-ready' ? 'error' : 'warning'}
        >
          {readiness === 'not-ready'
            ? 'The readiness probe reports a dependency the API needs to answer at all. Anything below may be stale, partial or missing for reasons that are not about the catalog.'
            : 'The readiness probe has not answered. Whether the API can serve is unknown rather than bad — this is the absence of a reading, not a fault it reported.'}
        </Note>
      ) : null}

      <StackLayout gap={1}>
        <Text styleAs="h4" as="h2">
          At a glance
        </Text>
        <SummaryRow client={client} session={session} />
      </StackLayout>

      <StackLayout gap={1}>
        <Text styleAs="h4" as="h2">
          Start here
        </Text>
        <TileGrid columns={2}>
          {available.map((section) => (
            <SectionNavCard key={section.key} section={section} onNavigate={navigate} />
          ))}
        </TileGrid>
      </StackLayout>

      {can(session, 'notification:read') ? (
        <RecentChanges client={client} session={session} />
      ) : null}

      {/*
        The producer's half of the page, gated on the scope rather than the role.
        Its rows are the capabilities this tenant owns, so for a consumer the read
        is refused and for a producer who publishes nothing it is empty — both of
        which the panel says in words rather than showing as a blank.
      */}
      {can(session, 'usage:read:owned') ? (
        <WhatYouPublish client={client} session={session} />
      ) : null}

      <SectionCard
        title="Your access"
        description="Who the registry resolved this session to, and what that carries. Switching persona in the header changes all of it."
      >
        <StackLayout gap={2}>
          <TileGrid columns={3}>
            <StatTile
              label="Service"
              status={READINESS_STATUS[readiness]}
              value={<Text>{READINESS_TEXT[readiness]}</Text>}
              hint="GET /readyz — dependencies the API needs to answer at all"
            />
            <StatTile
              label="Signed in as"
              value={<Text>{session.actorDisplayName ?? session.actorId}</Text>}
              hint={session.actorEmail ?? session.actorId}
            />
            <StatTile
              label="Role"
              value={<Text>{session.role}</Text>}
              // Said here because it is the fact behind every refusal in the app:
              // roles do not combine, so holding two entitlements grants the higher
              // one and not the union.
              hint="Resolved by the registry from your entitlements. One role per session."
            />
          </TileGrid>

          <StackLayout gap={1}>
            <Text styleAs="label" as="h3">
              Permissions
            </Text>
            <Text styleAs="notation" color="secondary">
              {capabilitiesFor(session.role).join(' · ')}
            </Text>
          </StackLayout>

          {unavailable.length > 0 ? (
            <StackLayout gap={1}>
              <Text styleAs="label" as="h3">
                Not available to this role
              </Text>
              {unavailable.map((section) => (
                <Text key={section.key} color="secondary">
                  <strong>{section.label}</strong> — {section.description}
                </Text>
              ))}
            </StackLayout>
          ) : null}

          {/*
            Asked as the missing capability rather than as "not the auditor role".
            The two are equivalent today because that capability is auditor-only, but
            the note exists *because* the reader cannot read the audit log — so that
            is the condition worth writing, and it keeps the role list in the one
            place that is tested against the API.
          */}
          {!can(session, 'audit:read') && auditorPersona ? (
            <StackLayout gap={1}>
              <Text styleAs="label" as="h3">
                About the audit log
              </Text>
              <Prose>
                <Text color="secondary">
                  The registry grants exactly one role per session and resolves it by precedence,
                  with administrator above auditor. The audit endpoint requires the auditor role
                  specifically, so an identity holding both is resolved to administrator and
                  refused. Reading the audit log means signing in as{' '}
                  <strong>{auditorPersona.label}</strong> — the switcher in the header does that in
                  one step.
                </Text>
              </Prose>
            </StackLayout>
          ) : null}
        </StackLayout>
      </SectionCard>
    </StackLayout>
  );
}

/**
 * What this tenant publishes, and whether anything called it.
 *
 * The one panel on the page whose presence depends on the reader, and it earns
 * that because the underlying read does: `usage:read:owned` returns the
 * capabilities this tenant owns, so for a consumer there is nothing to ask for
 * rather than something being withheld.
 *
 * Three columns and no ranking. The rows arrive in the order the service sends
 * them; sorting them by calls here would be this console deciding which of a
 * producer's capabilities matters, from one window of one tenant's traffic.
 *
 * The window is the service's, not this page's — `describeWindow` reads back what
 * the response says it covered, because a usage figure without its window is a
 * number pretending to be a rate.
 */
function WhatYouPublish({ client, session }: { client: RegistryClient; session: Session }) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const owned = useOwnedCapabilityUsage(client, scope, undefined);
  const usagePage = remoteChildHref('operations', 'usage');

  const rows = owned.data?.capabilities ?? [];
  const window = owned.data
    ? `${isoDay(owned.data.start) ?? '?'} and ${isoDay(owned.data.end) ?? '?'}`
    : null;
  return (
    <SectionCard
      banded
      title="What you publish"
      action={<KLink to={usagePage}>Full usage</KLink>}
      description={
        window
          ? `Capabilities your tenant owns that were called between ${window}, the window the service reports. Absence from this list means no calls were recorded, not that the capability is gone.`
          : 'Capabilities your tenant owns that were called in the window the service reports. Absence from this list means no calls were recorded, not that the capability is gone.'
      }
    >
      {owned.error ? (
        <ErrorPanel error={owned.error} title="Could not read usage of what you publish" />
      ) : (
        <DataTable
          zebra
          caption="Capabilities you publish"
          hideCaption
          isLoading={owned.isPending}
          emptyTitle="Nothing you publish was called"
          emptyDescription="No calls were recorded against a capability your tenant owns in this window. That is a fact about the window, not about whether anyone depends on you — the impact panel on each capability answers that."
          emptyHeadingLevel="h3"
          rows={[...rows]}
          getRowId={(row) => row.capability_id}
          columns={[
            {
              key: 'name',
              header: 'Capability',
              render: (row) => (
                <KLink
                  underline="never"
                  color="primary"
                  to={remoteChildHref('catalog', encodeURIComponent(row.capability_id))}
                >
                  {row.name}
                </KLink>
              ),
            },
            {
              key: 'calls',
              header: 'Calls',
              align: 'right' as const,
              figures: 'tabular' as const,
              render: (row) => <Text>{row.calls.toLocaleString()}</Text>,
            },
            {
              key: 'error_calls',
              header: 'Failed',
              align: 'right' as const,
              figures: 'tabular' as const,
              render: (row) => <Text>{row.error_calls.toLocaleString()}</Text>,
            },
          ]}
        />
      )}
    </SectionCard>
  );
}

/**
 * What the reader can actually be told a number about.
 *
 * The dashboard deliberately carried no tiles, and the reasoning behind that still
 * holds in full: the list endpoints serve a page and a cursor, not a total, so a tile
 * reading "42 capabilities" could only ever mean "42 on the first page". That has not
 * changed and no tile here counts a list.
 *
 * What changed is the observation that four endpoints *do* serve aggregates — the
 * usage summary, the owned-capability usage, operational health — and none of them
 * was on the landing page, so a reader arriving cold got navigation cards and two
 * five-row teasers. The row below draws only on those, states its window inline, and
 * links each tile to the page that owns the detail.
 *
 * **It shrinks by role rather than showing zeros.** A tile whose source this identity
 * cannot read is absent, and the row says once, in a sentence, that it is. For a
 * consumer or an auditor that means no tiles at all, and that is the honest answer:
 * their dashboard is a dispatch page, and what fixes it is destinations and search,
 * not invented numbers.
 *
 * The one derived figure is the sum over owned capabilities, and it is defensible
 * only because that list is complete and uncursored — summing it is reporting the
 * response rather than deriving a metric the API did not serve. It says so in the
 * tile's own hint.
 */
/**
 * What a reader did, for the reader who can be told no numbers.
 *
 * Recents are the only "at a glance" available to a consumer: the catalog endpoints
 * serve pages and cursors rather than totals, and the aggregate reads are gated. This
 * makes no claim about the tenant at all — it is the reader's own trail, which is
 * what a dispatch page should carry.
 *
 * Read from the same per-persona key the search field writes, so switching identity
 * does not surface a search whose results that identity cannot see.
 */
function RecentActivity({ session }: { session: Session }) {
  const [recents, setRecents] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `kui:recent-searches:${session.personaKey ?? 'unknown'}`,
      );
      if (raw) setRecents(JSON.parse(raw) as string[]);
    } catch {
      /* private browsing — no trail to show */
    }
  }, [session.personaKey]);

  if (recents.length === 0) {
    return (
      <Text color="secondary">
        Nothing to summarise yet. This role holds none of the aggregate reads, and the catalog
        endpoints serve a page and a cursor rather than a total — so rather than a count that would
        only mean &ldquo;as many as fit on one page&rdquo;, your recent searches appear here once
        you have made some.
      </Text>
    );
  }

  return (
    <FlowLayout gap={1}>
      {recents.map((entry: string) => (
        <KLink key={entry} to={`/catalog?q=${encodeURIComponent(entry)}`}>
          {entry}
        </KLink>
      ))}
    </FlowLayout>
  );
}

function SummaryRow({ client, session }: { client: RegistryClient; session: Session }) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const canOperator = can(session, 'usage:read:operator');
  const canOwned = can(session, 'usage:read:owned');
  const canOps = can(session, 'ops:operate');

  const summary = useUsageSummary(client, scope, {}, { enabled: canOperator });
  const owned = useOwnedCapabilityUsage(client, scope, undefined, { enabled: canOwned });
  const health = useOperationalHealth(client, scope, { enabled: canOps });

  const tiles: Array<{ key: string; label: string; value: string; hint: string; href: string }> =
    [];

  if (canOperator && summary.data) {
    const calls = summary.data.surfaces.reduce((total, s) => total + (s.calls ?? 0), 0);
    const failed = summary.data.surfaces.reduce((total, s) => total + (s.error_calls ?? 0), 0);
    const window = describeWindow(summary.data);
    tiles.push({
      key: 'calls',
      label: 'Calls',
      value: calls.toLocaleString(),
      hint: `Summed across every surface, ${window}.`,
      href: '/ops/usage',
    });
    tiles.push({
      key: 'failed',
      label: 'Failed Calls',
      value: failed.toLocaleString(),
      hint: `Counted, not rated — a rate over one reading would be invented. ${window}.`,
      href: '/ops/usage',
    });
  }

  if (canOwned && owned.data) {
    const rows = owned.data.capabilities ?? [];
    tiles.push({
      key: 'owned',
      label: 'Capabilities You Own',
      value: rows.length.toLocaleString(),
      hint: `A count of the response, which is complete rather than paged. ${describeWindow(owned.data)}.`,
      href: '/ops/usage',
    });
  }

  if (canOps && health.data) {
    const deepest = health.data.queues.reduce(
      (worst, reading) => Math.max(worst, Number(reading.value ?? 0)),
      0,
    );
    tiles.push({
      key: 'queue',
      label: 'Deepest Queue',
      value: deepest.toLocaleString(),
      hint: 'The largest backlog reported in the latest snapshot, not a trend.',
      href: '/ops/metrics',
    });
  }

  /*
    A consumer holds none of the aggregate reads, so this row would be empty for the
    most common reader on the most-visited page — which is most of why the dashboard
    read as plain. An empty row is not the honest answer; the honest answer is that
    the useful thing for that reader is not a number, it is their own trail.
  */
  if (tiles.length === 0) return <RecentActivity session={session} />;

  return (
    <TileGrid columns={3}>
      {tiles.map((tile) => (
        <StatTile key={tile.key} label={tile.label} value={tile.value} hint={tile.hint} />
      ))}
    </TileGrid>
  );
}

/**
 * The unread feed, shortened to what fits above the fold.
 *
 * Its own component so the query is not run for a role that cannot read it —
 * hooks cannot be called conditionally, and gating the panel by rendering it
 * conditionally is what keeps a guaranteed 403 off the wire.
 *
 * Five rows, and no count anywhere. `GET /v1/notifications` serves a page and a
 * cursor; "5" would be the page size, not a total, so the panel says what it is
 * showing and links to the page that pages properly.
 */
function RecentChanges({ client, session }: { client: RegistryClient; session: Session }) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const query = useNotifications(client, scope, { status: 'unread', pageSize: 5 });
  const inbox = remoteChildHref('catalog', 'notifications');

  const rows = (query.data?.items ?? []).map((n) => ({
    id: String(n.notification_id),
    slug: String(n.capability_slug),
    kind: String(n.event_kind),
    occurred: String(n.occurred_at),
  }));

  return (
    <SectionCard
      banded
      title="Recent changes"
      action={<KLink to={inbox}>View all</KLink>}
      description="Unread changes to the capabilities your tenant subscribes to. The entry carries the fact of a change; the capability carries what changed."
    >
      {query.error ? (
        <ErrorPanel error={query.error} title="Could not load recent changes" />
      ) : (
        <DataTable
          zebra
          caption="Recent changes"
          hideCaption
          isLoading={query.isPending}
          emptyTitle="Nothing unread"
          emptyDescription="You are up to date with every capability your tenant subscribes to."
          emptyHeadingLevel="h3"
          rows={rows}
          getRowId={(row) => row.id}
          columns={[
            {
              key: 'slug',
              header: 'Capability',
              render: (row) => (
                <KLink
                  underline="never"
                  color="primary"
                  to={remoteChildHref('catalog', encodeURIComponent(row.slug))}
                >
                  {row.slug}
                </KLink>
              ),
            },
            { key: 'kind', header: 'Event' },
            {
              key: 'occurred',
              header: 'When',
              figures: 'tabular' as const,
              render: (row) => <Text styleAs="notation">{instantText(row.occurred) ?? '—'}</Text>,
            },
          ]}
        />
      )}
    </SectionCard>
  );
}

/**
 * Binds `NavCard` to this app's router.
 *
 * The card itself is router-free — ui-kit takes no react-router dependency — so
 * resolving the path against the basename and performing the navigation are the
 * host's job. That is the whole of this adapter.
 */
function SectionNavCard({
  section,
  onNavigate,
}: {
  section: NavigationSection;
  onNavigate: (to: string) => void;
}) {
  return (
    <NavCard
      href={useHref(section.href)}
      onNavigate={() => onNavigate(section.href)}
      title={section.label}
      description={section.description}
    />
  );
}
