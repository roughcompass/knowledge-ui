import {
  Avatar,
  Card,
  Divider,
  FlexLayout,
  FlowLayout,
  GridLayout,
  SaltProviderNext,
  StackLayout,
  StatusIndicator,
  Text,
} from '@salt-ds/core';
import {
  ChatSolidIcon,
  DashboardSolidIcon,
  DatabaseSolidIcon,
  ListIcon,
  SearchIcon,
  SettingsSolidIcon,
  TreeSolidIcon,
  WarningSolidIcon,
} from '@salt-ds/icons';
import { useEffect, useState, type ReactNode } from 'react';
import {
  describeWindow,
  isSecondsReading,
  useNotifications,
  useOperationalHealth,
  useOwnedCapabilityUsage,
  useUsageSummary,
  type RegistryClient,
} from '@knowledge-ui/api-client';
import { can, type Persona, type Session } from '@knowledge-ui/auth';
import {
  countText,
  DataTable,
  ErrorPanel,
  Note,
  PageColumns,
  PageHeader,
  SectionCard,
  StatTile,
  TileGrid,
  instantText,
  isoDay,
  KLink,
  LinkButton,
  SectionHeading,
} from '@knowledge-ui/ui-kit';

import {
  NAVIGATION,
  remoteChildHref,
  remoteFor,
  type NavigationSection,
} from '../remotes/registry';

/** The probe's three host-visible states, as a reader would say them. */
const READINESS_TEXT = {
  ready: 'Ready',
  'not-ready': 'Not ready',
  unknown: 'Unknown',
} as const;

const SECTION_ICON: Record<string, typeof DatabaseSolidIcon> = {
  catalog: DatabaseSolidIcon,
  context: ChatSolidIcon,
  graph: TreeSolidIcon,
  operations: SettingsSolidIcon,
};

const SECTION_COLOR = {
  catalog: 'accent',
  context: 'category-2',
  graph: 'category-3',
  operations: 'category-4',
} as const;

type VisualColor = 'accent' | 'category-1' | 'category-2' | 'category-3' | 'category-4';

function FeatureVisual({
  Icon,
  color = 'accent',
  size = 1,
}: {
  Icon: typeof DatabaseSolidIcon;
  color?: VisualColor;
  size?: number;
}) {
  return <Avatar color={color} fallbackIcon={<Icon aria-hidden />} size={size} aria-hidden />;
}
/**
 * `info` rather than `warning` for the unknown case: not having heard back is not
 * a finding about the service, and colouring it as one would report a fault the
 * probe never observed.
 */

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
/**
 * Morning, afternoon or evening, by the reader's own clock.
 *
 * There is no server-side notion of the reader's day and no reason to invent one —
 * the browser knows, and being wrong about it is the kind of small dishonesty that
 * makes a greeting feel automated rather than addressed.
 */

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

/**
 * Greet by name only when the server gave one a person would answer to.
 *
 * Under the client-credentials grant the actor's display name *is* the client id, so
 * this greeted the reader by a machine identifier — which is worse than not greeting
 * at all, because the entire value of addressing someone is that it reads as
 * addressed rather than generated. A real identity provider sends a human name and
 * this passes it through unchanged.
 *
 * The identifier is described rather than quoted: a sourcemap carries every module's
 * original text, so an example here reaches `dist/**.map` and trips the build's own
 * search for development credentials.
 *
 * The test is shape, not a list: a machine identifier here is lower-case and
 * hyphen-or-dot separated with no spaces, and a name a person answers to is not. It
 * errs toward dropping the name, because a bare "Good morning" is unremarkable and a
 * greeting aimed at a service account is not.
 */
function personName(displayName: string | null | undefined): string | undefined {
  if (!displayName) return undefined;
  const machineShaped = /^[a-z0-9]+([-._][a-z0-9]+)+$/.test(displayName);
  return machineShaped ? undefined : displayName;
}

export function DashboardPage({
  session,
  personas: _personas,
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
  const available = NAVIGATION.filter((section) => can(session, section.need));

  return (
    <StackLayout gap={3}>
      {/*
        Greeted by name, and by time of day.

        The page opened "Capability Registry" — the product's own name, to a reader
        who had just clicked its logo to get here. A console is somewhere a person
        arrives repeatedly during a working day, and naming them is the cheapest
        thing it can do to read as somewhere they work rather than a document they
        landed on. The tenant and role stay as metadata, because those genuinely do
        change what the page will show them.

        Local time, since the reader's clock is the only one that makes "morning"
        true, and there is no server-side notion of their day.
      */}
      <PageHeader
        eyebrow="Global context"
        title={(() => {
          const name = personName(session.actorDisplayName);
          return name ? `${greeting()}, ${name}` : greeting();
        })()}
        description={`${todayLabel()} · Everything teams here publish for others to build on.`}
        actions={
          <KLink to={remoteChildHref('catalog', 'claims')} color="accent">
            <ListIcon aria-hidden /> Browse Claims
          </KLink>
        }
      />

      <KnowledgeHero session={session} readiness={readiness} />

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
            ? 'A dependency the API needs is down — everything below may be stale or missing.'
            : 'The readiness probe has not answered, so freshness below is unknown.'}
        </Note>
      ) : null}

      <AtAGlance client={client} session={session} />

      <PageColumns
        main={
          <StackLayout gap={3}>
            {can(session, 'notification:read') ? (
              <RecentChanges client={client} session={session} />
            ) : null}
            {can(session, 'usage:read:owned') ? (
              <WhatYouPublish client={client} session={session} />
            ) : null}
          </StackLayout>
        }
        aside={<DashboardRail session={session} available={available} />}
      />

      {/*
        Learn the contextplane sits ABOVE the destination grid, not at the foot.

        It was last, on the theory that orientation is a first-visit need. The user
        audit reversed that: for a reader who does not yet know what the product is,
        these three cards answer the question the destination grid assumes — so they
        outrank it. A reader who already knows scrolls one card-height past them.
      */}
      <StackLayout gap={2}>
        <SectionHeading eyebrow="Guided workflows" title="Learn the contextplane" />
        <GridLayout columns={{ xs: 1, sm: 3 }} gap={2}>
          <ResourceCard
            visual={<FeatureVisual Icon={SearchIcon} color="accent" />}
            title="Retrieval and trust"
            description="How the catalog, claims and your notes answer separately, each with a trust label."
            actionLabel="Open Context Lab"
            to={remoteChildHref('catalog', 'context')}
          />
          <ResourceCard
            visual={<FeatureVisual Icon={TreeSolidIcon} color="category-3" />}
            title="What depends on what"
            description="See dependents and blast radius before you ship a breaking change."
            actionLabel="Open Graph"
            to={remoteChildHref('catalog', 'graph')}
          />
          {/*
            Two write scopes, and holding either makes "keep your own" true.
            A reader with neither can still open every team workspace — the
            read admits all four roles — so the card promises reading instead
            of a write the server would refuse.
          */}
          {can(session, 'workspace:write:personal') || can(session, 'workspace:write:team') ? (
            <ResourceCard
              visual={<FeatureVisual Icon={ChatSolidIcon} color="category-2" />}
              title="Keep your own notes"
              description="Decisions and open questions, private to you or your tenant."
              actionLabel="Open Workspaces"
              to={remoteChildHref('catalog', 'workspaces')}
            />
          ) : (
            <ResourceCard
              visual={<FeatureVisual Icon={ChatSolidIcon} color="category-2" />}
              title="Read your tenant's notes"
              description="Decisions and open questions other teams keep beside the catalog. Your role can read them, not write them."
              actionLabel="Open Workspaces"
              to={remoteChildHref('catalog', 'workspaces')}
            />
          )}
        </GridLayout>
      </StackLayout>

      {/*
        "Your access" is gone from this page. Identity already lives in the rail
        badge and the persona switcher; the capability list and the one-role rule
        moved to Session Details, which the footer links — reference material
        belongs where a reader goes to look things up, not on the page they land on.
        The audit-log explainer went with it: the audit route's own refusal state
        already names the auditor role and offers the switch.
      */}

      {/*
        The reference closes with a quiet row of links rather than a card. These are
        the three a reader wants when something is wrong or unclear, and none of them
        deserves a destination card competing with the sections above.
      */}
      <StackLayout gap={2}>
        <Divider variant="tertiary" />
        <FlexLayout gap={3} justify="space-between" wrap>
          <Text styleAs="notation" color="secondary">
            Context is served by the registry API and scoped to this identity.
          </Text>
          <FlexLayout gap={3} wrap>
            <KLink to="/ops">API Status</KLink>
            <KLink to="/_session">Session Details</KLink>
          </FlexLayout>
        </FlexLayout>
      </StackLayout>
    </StackLayout>
  );
}
function KnowledgeHero({
  session,
  readiness,
}: {
  session: Session;
  readiness: 'ready' | 'not-ready' | 'unknown';
}) {
  const readinessStatus =
    readiness === 'ready' ? 'success' : readiness === 'not-ready' ? 'error' : 'warning';

  return (
    <SaltProviderNext mode="dark">
      <Card variant="primary" accent="top">
        <GridLayout columns={{ xs: 1, md: 2 }} gap={4}>
          <StackLayout gap={2}>
            <FlexLayout gap={1} align="center">
              <StatusIndicator status={readinessStatus} />
              <Text styleAs="notation" color="secondary">
                {`Live context · ${session.tenantDisplayName} · ${READINESS_TEXT[readiness]}`}
              </Text>
            </FlexLayout>
            <Text styleAs="h1" as="h2">
              Context for every platform decision
            </Text>
            <Text color="secondary">
              Discover what teams ship, trace dependencies before change, and inspect the evidence
              behind every claim.
            </Text>
            <FlexLayout gap={2} wrap>
              <KLink to={remoteFor('catalog').mountPath} color="accent">
                Browse Capabilities
              </KLink>
              <KLink to={remoteChildHref('catalog', 'context')} color="accent">
                Probe Context
              </KLink>
            </FlexLayout>
          </StackLayout>

          <GridLayout columns={3} gap={2}>
            <StackLayout gap={2}>
              <FeatureVisual Icon={DatabaseSolidIcon} color="accent" />
              <Text styleAs="h3">Discover</Text>
              <Text styleAs="notation" color="secondary">
                Capabilities and interfaces
              </Text>
            </StackLayout>
            <StackLayout gap={2}>
              <FeatureVisual Icon={TreeSolidIcon} color="category-3" />
              <Text styleAs="h3">Assess</Text>
              <Text styleAs="notation" color="secondary">
                Dependencies and impact
              </Text>
            </StackLayout>
            <StackLayout gap={2}>
              <FeatureVisual Icon={SearchIcon} color="category-2" />
              <Text styleAs="h3">Prove</Text>
              <Text styleAs="notation" color="secondary">
                Citations and confidence
              </Text>
            </StackLayout>
          </GridLayout>
        </GridLayout>
      </Card>
    </SaltProviderNext>
  );
}

function DashboardRail({
  session,
  available,
}: {
  session: Session;
  available: readonly NavigationSection[];
}) {
  return (
    <StackLayout gap={3}>
      {can(session, 'audit:read') ? (
        <ResourceCard
          visual={<FeatureVisual Icon={ListIcon} color="category-4" />}
          title="Review what changed"
          description="Every change to the contextplane, newest first, with what each one touched."
          actionLabel="Open Audit Log"
          to={remoteChildHref('operations', 'audit')}
        />
      ) : null}

      <SectionCard
        accent="top"
        title="Action center"
        description="The most useful destinations available to this identity."
      >
        <StackLayout gap={2} separators>
          {available.slice(0, 4).map((section) => (
            <FlexLayout key={section.key} gap={2} align="center">
              <FeatureVisual
                Icon={SECTION_ICON[section.key] ?? DatabaseSolidIcon}
                color={SECTION_COLOR[section.key as keyof typeof SECTION_COLOR] ?? 'accent'}
                size={0.8}
              />
              <KLink to={section.href} color="accent">
                {section.label}
              </KLink>
            </FlexLayout>
          ))}
        </StackLayout>
      </SectionCard>
    </StackLayout>
  );
}

/**
 * A destination with a sentence of why, and one control.
 *
 * The same shape as the navigation cards above, deliberately: a reader should not
 * have to learn two card idioms on one page. What differs is the job — those are the
 * sections of the product, these are the things worth understanding once. Kept as a
 * local component rather than a kit export because nothing else needs it yet, and a
 * primitive invented for one page is one nobody else can find.
 */
function ResourceCard({
  visual,
  title,
  description,
  actionLabel,
  to,
}: {
  visual: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  to: string;
}) {
  return (
    <SectionCard title={title} description={description} visual={visual} accent="top" hoverable>
      <FlexLayout justify="start">
        <LinkButton to={to}>{actionLabel}</LinkButton>
      </FlexLayout>
    </SectionCard>
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
      visual={<FeatureVisual Icon={DatabaseSolidIcon} color="category-2" size={0.8} />}
      title="What you publish"
      actions={
        <KLink to={usagePage} color="accent" underline="never">
          Full Usage
        </KLink>
      }
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
                  color="accent"
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
      <FlexLayout gap={2} align="center" justify="space-between" wrap>
        <Text color="secondary">
          Your recent searches will appear here after the first catalog query.
        </Text>
        <KLink to="/catalog" color="accent">
          Search Catalog
        </KLink>
      </FlexLayout>
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

function AtAGlance({ client, session }: { client: RegistryClient; session: Session }) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };

  const canOperator = can(session, 'usage:read:operator');
  const canOwned = can(session, 'usage:read:owned');
  const canOps = can(session, 'ops:operate');

  const summary = useUsageSummary(client, scope, {}, { enabled: canOperator });
  const owned = useOwnedCapabilityUsage(client, scope, undefined, { enabled: canOwned });
  const health = useOperationalHealth(client, scope, { enabled: canOps });

  /*
    A consumer or an auditor holds none of the aggregate reads, so the row would be
    empty for the most common reader on the most-visited page. An empty row is not
    the honest answer; the honest answer is that the useful thing for that reader is
    not a number, it is their own trail — and the heading says so, because a trail
    titled "At a glance" promises figures that are not coming.
  */
  if (!canOperator && !canOwned && !canOps) {
    return (
      <StackLayout gap={2}>
        <SectionHeading eyebrow="Your workspace" title="Pick up where you left off" />
        <SectionCard
          title="Recent searches"
          headingLevel="h3"
          visual={<FeatureVisual Icon={SearchIcon} color="accent" />}
          variant="secondary"
        >
          <RecentActivity session={session} />
        </SectionCard>
      </StackLayout>
    );
  }

  /*
    The usage summary and the owned-capability read are separate endpoints and each
    reports the window it covered, so the two can disagree. When they agree the
    window is a fact about the whole row and is said once, under the heading; only
    when they differ does each tile carry its own, because collapsing two different
    windows into one sentence would put the wrong dates under somebody's number.
  */
  const windows = new Set<string>();
  if (canOperator && summary.data) windows.add(describeWindow(summary.data));
  if (canOwned && owned.data) windows.add(describeWindow(owned.data));
  const sharedWindow = windows.size === 1 ? [...windows][0] : undefined;

  const tiles: Array<{
    key: string;
    label: string;
    value: string;
    hint: string;
    href: string;
    visual: ReactNode;
  }> = [];

  if (canOperator && summary.data) {
    const calls = summary.data.surfaces.reduce((total, s) => total + (s.calls ?? 0), 0);
    const failed = summary.data.surfaces.reduce((total, s) => total + (s.error_calls ?? 0), 0);
    const window = describeWindow(summary.data);
    tiles.push({
      key: 'calls',
      label: 'Calls',
      value: calls.toLocaleString(),
      hint: sharedWindow
        ? 'Summed across every surface.'
        : `Summed across every surface, ${window}.`,
      href: '/ops/usage',
      visual: <FeatureVisual Icon={DashboardSolidIcon} color="accent" />,
    });
    tiles.push({
      key: 'failed',
      label: 'Failed Calls',
      value: failed.toLocaleString(),
      hint: sharedWindow
        ? 'Counted, not rated — a rate over one reading would be invented.'
        : `Counted, not rated — a rate over one reading would be invented. ${window}.`,
      href: '/ops/usage',
      visual: <FeatureVisual Icon={WarningSolidIcon} color="category-4" />,
    });
  }

  if (canOwned && owned.data) {
    const rows = owned.data.capabilities ?? [];
    tiles.push({
      key: 'owned',
      label: 'Capabilities You Own',
      value: rows.length.toLocaleString(),
      hint: sharedWindow
        ? 'A count of the response, which is complete rather than paged.'
        : `A count of the response, which is complete rather than paged. ${describeWindow(owned.data)}.`,
      href: '/ops/usage',
      visual: <FeatureVisual Icon={DatabaseSolidIcon} color="category-2" />,
    });
  }

  if (canOps && health.data) {
    /*
      The health feed mixes queue depths with seconds-valued age gauges, and a max
      over both compares seconds to items — the age is the biggest number in the
      snapshot, so it always won. Only depth readings compete for this tile, and if
      the snapshot carries none the tile is absent rather than a zero over nothing.
    */
    const depths = health.data.queues.filter((reading) => !isSecondsReading(reading));
    const deepest = countText(
      depths.reduce((worst, reading) => Math.max(worst, Number(reading.value ?? 0)), 0),
    );
    if (depths.length > 0 && deepest !== undefined) {
      tiles.push({
        key: 'queue',
        label: 'Deepest Queue',
        value: deepest,
        hint: 'The largest queue backlog in the latest snapshot, not a trend.',
        href: '/ops',
        visual: <FeatureVisual Icon={SettingsSolidIcon} color="category-3" />,
      });
    }
  }

  return (
    <StackLayout gap={2}>
      <SectionHeading
        eyebrow="Platform signals"
        title="At a glance"
        action={
          canOwned ? (
            <KLink to={remoteChildHref('operations', 'usage')} color="accent" underline="never">
              Full Usage
            </KLink>
          ) : undefined
        }
      />
      {sharedWindow ? (
        <Text color="secondary">
          Usage figures cover {sharedWindow}, the window the service reports.
        </Text>
      ) : null}
      {tiles.length > 0 ? (
        <TileGrid columns={3}>
          {tiles.map((tile) => (
            <StatTile
              key={tile.key}
              label={tile.label}
              value={tile.value}
              hint={tile.hint}
              visual={tile.visual}
            />
          ))}
        </TileGrid>
      ) : null}
    </StackLayout>
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
      visual={<FeatureVisual Icon={ChatSolidIcon} color="category-2" size={0.8} />}
      title="Recent changes"
      actions={
        <KLink to={inbox} color="accent" underline="never">
          View All
        </KLink>
      }
      description="Unread changes to the capabilities your tenant subscribes to."
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
                  color="accent"
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
