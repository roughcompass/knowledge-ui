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
import {
  AppShell,
  AppSidebar,
  ContentColumn,
  RailBrand,
  ScopeBreadcrumb,
  ScopeSwitcher,
  SidebarBack,
  type BreadcrumbSegment,
} from '@knowledge-ui/ui-kit';
import {
  ChevronRightIcon,
  DarkIcon,
  DashboardIcon,
  HomeIcon,
  LightIcon,
  ListIcon,
} from '@salt-ds/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { REMOTES, type RemoteDescriptor } from '../remotes/registry';

/** Shared by the skip link and the main landmark it targets. */
const MAIN_ID = 'main-content';

/**
 * One icon per top-level destination.
 *
 * Top level only. A drilled panel's children deliberately have none — the section
 * name in the panel header already says where you are, and a second column of
 * icons at that depth reads as noise rather than orientation.
 */
const NAV_ICON: Record<string, typeof HomeIcon> = {
  catalog: ListIcon,
  operations: DashboardIcon,
};

/**
 * The application frame: a resizable navigation rail, a thin top bar, content.
 *
 * Navigation drills rather than nests. A section with child pages replaces the
 * rail's contents with its own list plus a back control, so the rail never
 * indents and never grows a second level of chrome. Which panel shows is derived
 * from the route, not from click state, so a deep link into a child page opens
 * with the correct panel already in place.
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
}: {
  session: Session;
  personas: readonly Persona[];
  onSwitchPersona: (personaKey: string) => void;
  mode: 'light' | 'dark';
  onToggleMode: () => void;
  readiness: 'ready' | 'not-ready' | 'unknown';
}) {
  const location = useLocation();

  const visible = REMOTES.filter((remote) => can(session, remote.need));

  /*
   * Which section owns the current route, if any. This is what makes the drill
   * state a function of the URL: no click handler decides which panel is showing,
   * so refreshing or pasting a link cannot desynchronise the rail from the page.
   */
  const drilled = visible.find(
    (remote) =>
      remote.children !== undefined &&
      (location.pathname === remote.mountPath ||
        location.pathname.startsWith(`${remote.mountPath}/`)),
  );

  const childHref = (remote: RemoteDescriptor, path: string) =>
    path === '' ? remote.mountPath : `${remote.mountPath}/${path}`;

  const breadcrumb: BreadcrumbSegment[] = [
    { key: 'tenant', content: <Text color="secondary">{session.tenantDisplayName}</Text> },
    ...(drilled
      ? [
          {
            key: drilled.name,
            content: <Text>{drilled.label}</Text>,
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
        topBar={<ScopeBreadcrumb segments={breadcrumb} label="Location" />}
        rail={
          <AppSidebar
            label={drilled ? `${drilled.label} pages` : 'Sections'}
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
            {drilled ? (
              <StackLayout gap={0}>
                {/*
                  Back leaves the section rather than returning to its index route.
                  The drill state is derived from the path, so navigating to
                  `/ops` would keep the panel exactly where it is — the only route
                  that closes the panel is one outside every section, which is the
                  overview. The label says so.
                */}
                <SidebarBack href="/" render={(props) => <Link to="/" {...props} />}>
                  Overview
                </SidebarBack>
                {drilled.children
                  ?.filter((child) => child.need === undefined || can(session, child.need))
                  .map((child) => {
                    const href = childHref(drilled, child.path);
                    return (
                      <NavigationItem
                        key={child.path}
                        href={href}
                        // Exact match: the section index would otherwise stay
                        // active on every child route, which is how two items
                        // ended up claiming `aria-current` at once before.
                        active={location.pathname === href}
                        orientation="vertical"
                        render={(props) => <Link to={href} {...props} />}
                      >
                        {child.label}
                      </NavigationItem>
                    );
                  })}
              </StackLayout>
            ) : (
              <StackLayout gap={0}>
                <NavigationItem
                  href="/"
                  active={location.pathname === '/'}
                  orientation="vertical"
                  render={(props) => <Link to="/" {...props} />}
                >
                  <FlexLayout gap={1} align="center">
                    <HomeIcon aria-hidden />
                    Overview
                  </FlexLayout>
                </NavigationItem>
                {visible.map((remote) => {
                  const Icon = NAV_ICON[remote.name];
                  return (
                    <NavigationItem
                      key={remote.name}
                      href={remote.mountPath}
                      active={location.pathname.startsWith(remote.mountPath)}
                      orientation="vertical"
                      render={(props) => <Link to={remote.mountPath} {...props} />}
                    >
                      <FlexLayout gap={1} align="center" justify="space-between">
                        <FlexLayout gap={1} align="center">
                          {Icon ? <Icon aria-hidden /> : null}
                          {remote.label}
                        </FlexLayout>
                        {/* Signals "this drills in" rather than "this navigates". */}
                        {remote.children ? <ChevronRightIcon aria-hidden /> : null}
                      </FlexLayout>
                    </NavigationItem>
                  );
                })}
              </StackLayout>
            )}
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
