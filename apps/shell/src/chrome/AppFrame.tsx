import {
  Button,
  FlexLayout,
  NavigationItem,
  SkipLink,
  StackLayout,
  StatusIndicator,
  Tag,
  Text,
} from '@salt-ds/core';
import { can, type Persona, type Session } from '@knowledge-ui/auth';
import { useCapability, useWorkspace, type RegistryClient } from '@knowledge-ui/api-client';
import {
  AppShell,
  AppSidebar,
  ContentColumn,
  RailBrand,
  ScopeBreadcrumb,
  ScopeSwitcher,
  KLink,
  type BreadcrumbSegment,
} from '@knowledge-ui/ui-kit';
import {
  ChatIcon,
  DarkIcon,
  DashboardIcon,
  LightIcon,
  ListIcon,
  SettingsIcon,
  TreeIcon,
} from '@salt-ds/icons';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { NAVIGATION, navigationSectionForPath } from '../remotes/registry';
import { GlobalSearch } from './GlobalSearch';

/** Shared by the skip link and the main landmark it targets. */
const MAIN_ID = 'main-content';

/** Sits beside `kui:sidebar-width`, which the rail already persists. */
const COLLAPSED_STORAGE_KEY = 'kui:nav-collapsed';

/** The full 36-character form. Anything shorter is already a human-usable handle. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The entity segment of the breadcrumb: a display name where one exists, never a
 * bare 36-character UUID.
 *
 * The pages that know the entity's name live in remotes, and neither a React
 * context nor props cross the federation boundary — but the query cache does. The
 * share contract pins one `@tanstack/react-query` for the whole graph and the shell
 * provides the one `QueryClient`, so asking the same hook for the same key here
 * reads the row the page below is already fetching, deduplicated into a single
 * request rather than issued twice.
 *
 * Names exist for two of the entities a crumb can land on — workspaces and
 * capabilities — so those two resolve. A claim is id-only by design (its page's own
 * title is just "Claim"), so for it, and for any name still on its way or refused,
 * the first eight characters stand in: the same short face every table cell in the
 * product gives an unresolved reference.
 */
function EntityCrumb({
  base,
  trailing,
  session,
  client,
}: {
  /** The owning nav child's href, which says what kind of entity the handle names. */
  base: string;
  trailing: string;
  session: Session;
  client: RegistryClient;
}) {
  const scope = { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug };
  const [head = '', ...rest] = trailing.split('/');
  const isUuid = UUID_SHAPE.test(head);

  // Hooks run unconditionally; an `undefined` handle disables the query, so at most
  // one of these ever asks the network for anything.
  const workspace = useWorkspace(
    client,
    scope,
    isUuid && base.endsWith('/workspaces') ? head : undefined,
  );
  const capability = useCapability(client, scope, isUuid && base === '/catalog' ? head : undefined);

  const resolvedName =
    typeof workspace.data?.name === 'string'
      ? workspace.data.name
      : typeof capability.data?.name === 'string'
        ? capability.data.name
        : undefined;

  const headLabel = isUuid ? (resolvedName ?? head.slice(0, 8)) : head;
  // Deeper segments are a page's own sub-route (a capability tab, for instance) and
  // stay as written — but an id among them still gets the short face.
  const restLabel = rest
    .map((segment) => (UUID_SHAPE.test(segment) ? segment.slice(0, 8) : segment))
    .join('/');

  return <Text>{restLabel ? `${headLabel}/${restLabel}` : headLabel}</Text>;
}

/**
 * One icon per top-level destination.
 *
 * Top level only. Children deliberately have none: the section they sit under is
 * directly above them and indented against them, so a second column of icons at that
 * depth reads as noise rather than orientation.
 */
const NAV_ICON: Record<string, typeof ListIcon> = {
  catalog: ListIcon,
  context: ChatIcon,
  graph: TreeIcon,
  operations: SettingsIcon,
};

/**
 * The application frame: a resizable navigation rail, a thin top bar, content.
 *
 * Navigation nests rather than drills. Every section and every child it grants is on
 * screen at once, so a lateral move is one click from anywhere. Sections are
 * disclosures — collapsible, and remembered — while the leaves are the links. Which
 * item is current is derived from the route rather than from click state, so a deep
 * link opens with the rail already correct.
 *
 * The top bar carries the breadcrumb and the session controls, and nothing else.
 * Everything about *where you are* is in the rail and the breadcrumb; everything
 * about *what you are looking at* is in the page below.
 */
export function AppFrame({
  session,
  personas,
  onSwitchPersona,
  mode,
  onToggleMode,
  readiness,
  client,
}: {
  session: Session;
  personas: readonly Persona[];
  onSwitchPersona: (personaKey: string) => void;
  mode: 'light' | 'dark';
  onToggleMode: () => void;
  readiness: 'ready' | 'not-ready' | 'unknown';
  /** For the search field's suggestions; the shell owns the one client. */
  client: RegistryClient;
}) {
  const location = useLocation();

  const visible = NAVIGATION.filter((section) => can(session, section.need));

  /*
   * Which sections the reader has closed.
   *
   * Stored as the collapsed set rather than the expanded one, so a section added
   * later arrives open: a reader who has never expressed an opinion about it should
   * see it, and an empty stored value means "nothing closed" rather than "everything
   * closed". Read in an effect rather than a state initialiser for the reason the
   * rail's own width is: the standalone prerender pass has no `window`.
   */
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as string[]);
    } catch {
      /* private browsing, or a value someone hand-edited — open everything */
    }
  }, []);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* the choice simply will not outlive the tab */
      }
      return next;
    });
  }, []);

  /*
   * Where the reader is, to four segments: tenant, section, page, entity.
   *
   * It used to stop at two — tenant and section — so on a capability it read
   * "dev / Catalog" and named neither the page nor the thing being looked at. No
   * segment was a link, which meant the one control whose whole job is "go up" could
   * not.
   *
   * Resolved against the FULL registry, not the capability-filtered `visible`. The
   * crumb is a location readout: a consumer standing on the audit log's refusal is
   * still standing on the audit log, and filtering that entry out left the longest
   * surviving prefix — Health's own `/ops` — claiming a page it does not own, with
   * the raw path fragment "audit" standing in for the page's name. Nothing here
   * grants access: only labels are read, and a segment the reader cannot enter is
   * rendered as text rather than a link.
   *
   * Built from the path rather than reported by the page, because the pages that
   * would name it live in remotes and a React context does not cross the federation
   * boundary. The child whose href prefixes the current path names the page, and
   * whatever remains is the entity's own handle, which `EntityCrumb` resolves.
   */
  const crumbSection = navigationSectionForPath(location.pathname);
  const crumbChild = crumbSection?.children
    .filter((child) => location.pathname.startsWith(child.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const trailing =
    crumbChild && location.pathname.length > crumbChild.href.length
      ? decodeURIComponent(location.pathname.slice(crumbChild.href.length).replace(/^\//, ''))
      : undefined;

  const crumbChildAllowed =
    crumbChild !== undefined && crumbSection !== undefined
      ? can(session, crumbChild.need ?? crumbSection.need)
      : false;

  const breadcrumb: BreadcrumbSegment[] = [
    { key: 'tenant', content: <Text color="secondary">{session.tenantDisplayName}</Text> },
    ...(crumbSection
      ? [
          {
            key: crumbSection.key,
            // Not a link: a section is a disclosure in the rail and owns no route of
            // its own, so a link here would have to invent a destination.
            content: <Text color="secondary">{crumbSection.label}</Text>,
          },
        ]
      : []),
    ...(crumbChild
      ? [
          {
            key: crumbChild.href,
            /*
              No `aria-current` on the trail. The rail already marks the current
              page, and an end-to-end invariant asserts that no two elements claim
              it — a breadcrumb here is a location readout, not a second navigation.
            */
            content:
              trailing && crumbChildAllowed ? (
                <KLink to={crumbChild.href}>{crumbChild.label}</KLink>
              ) : (
                <Text>{crumbChild.label}</Text>
              ),
          },
        ]
      : []),
    ...(trailing && crumbChild
      ? [
          {
            key: 'entity',
            content: (
              <EntityCrumb
                base={crumbChild.href}
                trailing={trailing}
                session={session}
                client={client}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {/*
        First focusable element on the page, by DOM order. Without it a keyboard
        reader crossed the whole rail before reaching content, on every route.
        Salt renders nothing if the target id is absent, so this cannot become a
        link to nowhere.
      */}
      <SkipLink targetId={MAIN_ID}>Skip to main content</SkipLink>

      <AppShell
        // Content only. `AppShell` owns the bar's element, height, padding and
        // hairline so it can hold the same height as the rail's header.
        topBar={
          <FlexLayout align="center" justify="space-between" gap={2}>
            <ScopeBreadcrumb segments={breadcrumb} label="Location" />
            <GlobalSearch session={session} client={client} />
          </FlexLayout>
        }
        rail={
          <AppSidebar
            label="Sections"
            header={<RailBrand name="Knowledge" badge={<Tag>{session.role}</Tag>} />}
            search={
              // The scope switcher, where the reference puts it. It was a bordered
              // 231px select in the footer, which read as a form field in the
              // middle of chrome.
              <ScopeSwitcher
                label="Signed in as"
                options={personas.map((persona) => ({
                  key: persona.key,
                  label: persona.label,
                  description: persona.description,
                }))}
                currentKey={session.personaKey}
                onChange={onSwitchPersona}
              />
            }
            footer={
              // Ambient session status only. Identity moved to the header, where
              // the reference keeps scope; connectivity and appearance are
              // readouts, not identity.
              <StackLayout gap={1}>
                <FlexLayout gap={1} align="center" justify="space-between">
                  <FlexLayout gap={1} align="center">
                    <StatusIndicator
                      status={
                        readiness === 'ready'
                          ? 'success'
                          : readiness === 'not-ready'
                            ? 'error'
                            : 'warning'
                      }
                    />
                    <Text styleAs="notation" color="secondary">
                      {readiness === 'ready'
                        ? 'API ready'
                        : readiness === 'not-ready'
                          ? 'API not ready'
                          : 'API unknown'}
                    </Text>
                  </FlexLayout>
                  <Button
                    appearance="transparent"
                    sentiment="neutral"
                    onClick={onToggleMode}
                    aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
                  >
                    {mode === 'light' ? <DarkIcon aria-hidden /> : <LightIcon aria-hidden />}
                  </Button>
                </FlexLayout>
              </StackLayout>
            }
          >
            {/*
              Every section, and every child of every section, on screen at once.

              This used to be a drill-down: opening a section replaced the panel with
              that section's children, and the only way out was a back link to the
              dashboard. Reaching a sibling therefore cost three navigations, on every
              lateral move — and no persona in this product works inside one section
              for a session. A producer's loop is a capability, then its usage, which
              lives in the other remote, then the change inbox. An auditor's crosses
              all three sections. The drill optimised for a reader who does not exist.

              Salt's `NavigationItem` has published `parent`, `expanded`, `level` and
              `blurActive` the whole time; the replace-the-panel behaviour was not a
              constraint of the component. An admin — the widest role — sees four
              sections and eighteen leaves, which fits the rail's scroll container.
              Every other role sees fewer, because capability gating already prunes
              both levels.
            */}
            <StackLayout gap={0}>
              <NavigationItem
                href="/"
                active={location.pathname === '/'}
                orientation="vertical"
                render={(props) => <Link to="/" {...props} />}
              >
                <FlexLayout gap={1} align="center">
                  <DashboardIcon aria-hidden />
                  Dashboard
                </FlexLayout>
              </NavigationItem>

              {visible.map((section) => {
                const Icon = NAV_ICON[section.key];
                const children = section.children.filter(
                  (child) => child.need === undefined || can(session, child.need),
                );
                const expanded = !collapsed.includes(section.key);
                const holdsActive = children.some((child) => child.href === location.pathname);

                return (
                  <Fragment key={section.key}>
                    <NavigationItem
                      parent
                      expanded={expanded}
                      orientation="vertical"
                      /*
                        A section is a disclosure, not a destination. Every section's
                        own href was its first child's, so "Catalog" and
                        "Capabilities" went to the same place and only the child ever
                        carried `aria-current`. Dropping the href removes the
                        duplicate rather than papering over it.
                      */
                      onExpand={() => toggleSection(section.key)}
                      /*
                        Marks a collapsed section that contains the current page, so
                        closing a section does not lose where you are. Salt only
                        honours this when the group is collapsed.
                      */
                      blurActive={!expanded && holdsActive}
                    >
                      <FlexLayout gap={1} align="center">
                        {Icon ? <Icon aria-hidden /> : null}
                        {section.label}
                      </FlexLayout>
                    </NavigationItem>

                    {expanded
                      ? children.map((child) => (
                          <NavigationItem
                            key={child.href}
                            href={child.href}
                            level={1}
                            // Exact match: a prefix match would leave two items
                            // claiming `aria-current` on a child route, which the
                            // accessibility sweep asserts against.
                            active={location.pathname === child.href}
                            orientation="vertical"
                            render={(props) => <Link to={child.href} {...props} />}
                          >
                            {child.label}
                          </NavigationItem>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </StackLayout>
          </AppSidebar>
        }
      >
        {/*
          The one main landmark. `tabIndex={-1}` so the skip link can move focus
          here without making the region a tab stop of its own.
        */}
        <StackLayout padding={3} gap={3} as="main" id={MAIN_ID} tabIndex={-1}>
          <ContentColumn>
            <StackLayout gap={3}>
              <Outlet />
            </StackLayout>
          </ContentColumn>
        </StackLayout>
      </AppShell>
    </>
  );
}
