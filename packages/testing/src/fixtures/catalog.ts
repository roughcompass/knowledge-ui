import type { Lifecycle } from './index';

/**
 * The mocked tenant's catalog: a Digital Enablement platform group inside a
 * corporate and investment bank.
 *
 * ## Why the roster is named rather than generated
 *
 * The list handler used to emit `capability-1 … capability-47`. Every screen
 * built against it was technically exercised and none of it could be *read*: a
 * reviewer could not tell whether the search ranking was sensible, whether the
 * lifecycle mix was plausible, or whether a dependency edge pointed somewhere a
 * bank would recognise. Placeholder names also quietly hide real problems —
 * column widths, truncation, and the difference between a slug and a display
 * name all look fine when every row is the same fourteen characters.
 *
 * So this is a roster of the things such a group actually publishes: a design
 * system and its tokens, the web and mobile frameworks its channels are built
 * on, the shared platform services underneath them, and the CIB domain APIs
 * those channels call. The mix of lifecycles, owners and tiers is the point —
 * a catalog where everything is `ga` and tier 1 tells a reader nothing.
 *
 * ## What this is not
 *
 * It is not a data source. Nothing here is served except through the handlers,
 * which still answer with exactly the fields the endpoint declares — a list row
 * carries no lifecycle, because the list resource does not. The roster supplies
 * *content*; the handlers remain the only thing that decides shape.
 *
 * Names are slugs because that is what the contextplane stores as `name` and what
 * appears in a URL. `display_name` is carried separately and is only used where
 * the API actually returns one.
 */

export interface CatalogEntry {
  /** The contextplane's `name`: the handle in the URL. */
  name: string;
  display_name: string;
  entity_type: 'capability' | 'concept' | 'operation';
  lifecycle: Lifecycle;
  /** The owning team, as it appears in the `owner` attribute. */
  owner: string;
  /** Bank-standard criticality tier, as a string because the attribute is one. */
  tier: '1' | '2' | '3';
  /** The body of the authoritative `overview` fact. */
  summary: string;
  external_id: string | null;
  /** Slugs this entry depends on, rendered as outbound edges on the detail page. */
  depends_on: readonly string[];
}

const entry = (
  name: string,
  display_name: string,
  entity_type: CatalogEntry['entity_type'],
  lifecycle: Lifecycle,
  owner: string,
  tier: CatalogEntry['tier'],
  summary: string,
  depends_on: readonly string[] = [],
  external_id: string | null = null,
): CatalogEntry => ({
  name,
  display_name,
  entity_type,
  lifecycle,
  owner,
  tier,
  summary,
  external_id,
  depends_on,
});

/**
 * The roster, grouped the way the group itself is organised. Order is stable so
 * paging through the list is reproducible.
 */
export const CATALOG: readonly CatalogEntry[] = [
  // ---- Design ------------------------------------------------------------
  entry(
    'salt-design-system',
    'Salt Design System',
    'capability',
    'ga',
    'design-systems',
    '1',
    'The bank’s accessible React component library. Every internal and client-facing web surface is expected to build on it rather than on bespoke components.',
    ['design-tokens'],
    'pkg:npm/@salt-ds/core',
  ),
  entry(
    'design-tokens',
    'Design Tokens',
    'capability',
    'ga',
    'design-systems',
    '1',
    'The single source of colour, spacing, typography and density values, published for web, iOS and Android so one brand decision lands everywhere.',
    [],
    'pkg:npm/@salt-ds/theme',
  ),
  entry(
    'pattern-library',
    'Interaction Pattern Library',
    'capability',
    'beta',
    'design-systems',
    '2',
    'Composed patterns above the component level — blotters, order tickets, approval flows — so two desks building the same screen arrive at the same screen.',
    ['salt-design-system'],
  ),
  entry(
    'accessibility-toolkit',
    'Accessibility Toolkit',
    'capability',
    'beta',
    'design-systems',
    '2',
    'Linting, axe integration and a keyboard-navigation test harness. Accessibility conformance is a regulatory commitment, not a preference.',
    ['salt-design-system'],
  ),

  // ---- Web platform ------------------------------------------------------
  entry(
    'web-app-shell',
    'Web App Shell',
    'capability',
    'ga',
    'web-platform',
    '1',
    'The host application: navigation, session, tenant selection and theming. Business teams ship a remote into it rather than standing up another site.',
    ['salt-design-system', 'identity-broker'],
  ),
  entry(
    'micro-frontend-runtime',
    'Micro-Frontend Runtime',
    'capability',
    'ga',
    'web-platform',
    '1',
    'Module Federation configuration, shared-dependency policy and version negotiation, so independently released remotes load into one page without duplicating React.',
    ['web-app-shell'],
  ),
  entry(
    'data-grid-toolkit',
    'Data Grid Toolkit',
    'capability',
    'ga',
    'web-platform',
    '1',
    'Virtualised grids for blotters and position views: hundreds of thousands of rows, column pinning, and export that matches what is on screen.',
    ['salt-design-system'],
  ),
  entry(
    'charting-toolkit',
    'Charting Toolkit',
    'capability',
    'beta',
    'web-platform',
    '2',
    'Time-series and distribution charts built on the token scale, for price history and exposure views.',
    ['design-tokens'],
  ),
  entry(
    'web-starter-kit',
    'Web Starter Kit',
    'capability',
    'beta',
    'web-platform',
    '3',
    'A generated project that is already wired to the shell, the design system, the gateway and the pipeline — the first hour of a new front end, removed.',
    ['micro-frontend-runtime', 'ci-pipeline-templates'],
  ),
  entry(
    'client-portal-web',
    'Client Portal Web',
    'capability',
    'ga',
    'digital-channels',
    '1',
    'The externally facing portal corporate treasurers sign in to: balances, payments, reporting and document exchange.',
    ['web-app-shell', 'payments-api', 'document-service'],
  ),
  entry(
    'trader-workbench-web',
    'Trader Workbench Web',
    'capability',
    'ga',
    'markets-technology',
    '1',
    'The internal desk workbench: blotter, order entry and risk views on one screen, assembled from remotes owned by different desks.',
    ['web-app-shell', 'data-grid-toolkit', 'trade-blotter-api'],
  ),

  // ---- Mobile platform ---------------------------------------------------
  entry(
    'mobile-app-framework',
    'Mobile App Framework',
    'capability',
    'ga',
    'mobile-platform',
    '1',
    'The shared React Native foundation behind the bank’s client apps: navigation, secure storage, biometrics and release tooling for both stores.',
    ['design-tokens', 'identity-broker'],
  ),
  entry(
    'mobile-design-kit',
    'Mobile Design Kit',
    'capability',
    'beta',
    'mobile-platform',
    '2',
    'The native counterpart of the design system, so an approval looks like the same approval on a phone as in the portal.',
    ['design-tokens', 'mobile-app-framework'],
  ),
  entry(
    'device-trust-sdk',
    'Device Trust SDK',
    'capability',
    'ga',
    'mobile-platform',
    '1',
    'Device attestation, jailbreak detection and step-up authentication, required before a mobile session may authorise a payment.',
    ['identity-broker'],
  ),
  entry(
    'push-delivery-sdk',
    'Push Delivery SDK',
    'capability',
    'beta',
    'mobile-platform',
    '2',
    'The device half of notification delivery: token registration, delivery receipts, and the rule that no payload leaves the perimeter in a push body.',
    ['notification-service', 'mobile-app-framework'],
  ),

  // ---- Shared platform services -----------------------------------------
  entry(
    'notification-service',
    'Notification Service',
    'capability',
    'ga',
    'messaging-platform',
    '1',
    'One place to send an alert, whatever it comes out as: email, SMS, in-app, push or webhook. Preferences, throttling and delivery evidence live here.',
    ['event-streaming-bus', 'entitlements-service'],
  ),
  entry(
    'identity-broker',
    'Identity Broker',
    'capability',
    'ga',
    'identity-platform',
    '1',
    'OIDC and SAML federation for staff and clients, including step-up and the token exchange every downstream service validates against.',
    [],
  ),
  entry(
    'entitlements-service',
    'Entitlements Service',
    'capability',
    'ga',
    'identity-platform',
    '1',
    'Who may see and do what, per legal entity and per client. The authority every channel asks before rendering a control.',
    ['identity-broker', 'reference-data-api'],
  ),
  entry(
    'audit-trail-service',
    'Audit Trail Service',
    'capability',
    'ga',
    'controls-platform',
    '1',
    'The append-only record of who did what, retained to the regulator’s schedule and readable only by the auditor role.',
    ['event-streaming-bus'],
  ),
  entry(
    'document-service',
    'Document Service',
    'capability',
    'ga',
    'content-platform',
    '2',
    'Statement, confirmation and contract storage with retention, watermarking and client-visible delivery.',
    ['entitlements-service'],
  ),
  entry(
    'api-gateway',
    'API Gateway',
    'capability',
    'ga',
    'integration-platform',
    '1',
    'The edge every internal API is published through: authentication, quota, mutual TLS to the perimeter and one place to see what is exposed.',
    ['identity-broker'],
  ),
  entry(
    'event-streaming-bus',
    'Event Streaming Bus',
    'capability',
    'ga',
    'integration-platform',
    '1',
    'The Kafka estate and its schema contextplane. Domain events are published once and consumed by whoever needs them, without point-to-point feeds.',
    [],
  ),
  entry(
    'feature-flag-service',
    'Feature Flag Service',
    'capability',
    'ga',
    'delivery-platform',
    '2',
    'Runtime toggles with an audit trail, so a release to production and a release to clients are two separate decisions.',
    ['audit-trail-service'],
  ),
  entry(
    'ci-pipeline-templates',
    'CI Pipeline Templates',
    'capability',
    'ga',
    'delivery-platform',
    '2',
    'Golden pipelines carrying the control gates — SAST, dependency scanning, change records — so a team inherits compliance instead of rebuilding it.',
    ['secrets-broker'],
  ),
  entry(
    'observability-platform',
    'Observability Platform',
    'capability',
    'ga',
    'site-reliability',
    '1',
    'Metrics, traces and logs with the retention and access rules the bank requires, and the dashboards on-call actually opens at three in the morning.',
    [],
  ),
  entry(
    'secrets-broker',
    'Secrets Broker',
    'capability',
    'ga',
    'security-platform',
    '1',
    'Short-lived credential issuance and rotation. Nothing in the estate is expected to hold a long-lived secret in configuration.',
    ['identity-broker'],
  ),

  // ---- CIB domain APIs ---------------------------------------------------
  entry(
    'payments-api',
    'Payments API',
    'capability',
    'ga',
    'payments-platform',
    '1',
    'Initiation, status and recall for high-value and bulk payments across the bank’s clearing routes, with idempotency the client controls.',
    ['reference-data-api', 'kyc-screening-service', 'event-streaming-bus'],
  ),
  entry(
    'fx-pricing-api',
    'FX Pricing API',
    'capability',
    'beta',
    'markets-platform',
    '1',
    'Streaming and request-for-quote pricing in the major and emerging pairs, with the tenor and tiering the client is entitled to.',
    ['market-data-gateway', 'entitlements-service'],
  ),
  entry(
    'trade-blotter-api',
    'Trade Blotter API',
    'capability',
    'ga',
    'markets-platform',
    '1',
    'The desk’s view of executions and their lifecycle states, filtered to what the reader is entitled to see.',
    ['event-streaming-bus', 'entitlements-service'],
  ),
  entry(
    'market-data-gateway',
    'Market Data Gateway',
    'capability',
    'ga',
    'markets-platform',
    '1',
    'Normalised vendor and exchange feeds, with the licensing constraints attached to the data rather than left to the consumer to remember.',
    ['event-streaming-bus'],
  ),
  entry(
    'reference-data-api',
    'Reference Data API',
    'capability',
    'ga',
    'data-platform',
    '1',
    'Counterparties, legal entities, instruments, calendars and standard settlement instructions — the nouns every other system agrees on.',
    [],
  ),
  entry(
    'client-onboarding-api',
    'Client Onboarding API',
    'capability',
    'beta',
    'onboarding-platform',
    '1',
    'Case-managed onboarding from first contact to first trade: documents, approvals and the account structure that results.',
    ['kyc-screening-service', 'document-service', 'reference-data-api'],
  ),
  entry(
    'kyc-screening-service',
    'KYC Screening Service',
    'capability',
    'ga',
    'financial-crime',
    '1',
    'Sanctions, PEP and adverse-media screening with the four-eyes review the policy requires before a match is cleared.',
    ['reference-data-api'],
  ),
  entry(
    'cash-positions-api',
    'Cash Positions API',
    'capability',
    'alpha',
    'treasury-platform',
    '2',
    'Intraday balances and projected positions per account and currency. Intraday figures are indicative until end-of-day reconciliation.',
    ['payments-api', 'reference-data-api'],
  ),

  // ---- Things on the way out --------------------------------------------
  entry(
    'host-to-host-file-gateway',
    'Host-to-Host File Gateway',
    'capability',
    'deprecated',
    'integration-platform',
    '2',
    'Scheduled SFTP file exchange with corporate ERP systems. Superseded by the API gateway; retained while clients migrate off it.',
    ['api-gateway'],
  ),
  entry(
    'soap-payments-bridge',
    'SOAP Payments Bridge',
    'capability',
    'deprecated',
    'payments-platform',
    '3',
    'A translation layer in front of the payments API for clients still on the 2014 WSDL. No new integrations are accepted.',
    ['payments-api'],
  ),
  entry(
    'legacy-client-portal',
    'Legacy Client Portal',
    'capability',
    'retired',
    'digital-channels',
    '3',
    'The previous generation portal. Switched off; the entry remains so links and references from that era still resolve to an explanation.',
    [],
  ),
  entry(
    'jquery-widget-pack',
    'jQuery Widget Pack',
    'capability',
    'retired',
    'design-systems',
    '3',
    'The pre-Salt component set. Retired — anything still importing it is running unsupported code.',
    [],
  ),

  // ---- Concepts ----------------------------------------------------------
  entry(
    'client-hierarchy',
    'Client Hierarchy',
    'concept',
    'ga',
    'data-governance',
    '1',
    'How a client group, its legal entities and its accounts relate. Entitlements, billing and exposure all resolve through this shape.',
    ['legal-entity-identifier'],
  ),
  entry(
    'legal-entity-identifier',
    'Legal Entity Identifier',
    'concept',
    'ga',
    'data-governance',
    '1',
    'The globally issued LEI, and the rules for when the bank may act on a counterparty that does not have one.',
    [],
  ),
  entry(
    'trade-lifecycle',
    'Trade Lifecycle',
    'concept',
    'ga',
    'markets-platform',
    '1',
    'The states a trade passes through from execution to settlement, and which of them a client is permitted to see.',
    [],
  ),
  entry(
    'settlement-cycle',
    'Settlement Cycle',
    'concept',
    'ga',
    'post-trade',
    '2',
    'T+1 and T+2 conventions by market, and the calendar rules that decide the actual date.',
    ['trade-lifecycle'],
  ),
  entry(
    'know-your-customer',
    'Know Your Customer',
    'concept',
    'ga',
    'financial-crime',
    '1',
    'The evidence the bank must hold about a client, when it must be refreshed, and what happens to access when it lapses.',
    [],
  ),
  entry(
    'design-token-scale',
    'Design Token Scale',
    'concept',
    'beta',
    'design-systems',
    '2',
    'The spacing, density and typographic ramps the tokens express, and why a screen picks a step rather than a pixel value.',
    [],
  ),

  // ---- Operations --------------------------------------------------------
  entry(
    'initiate-payment',
    'Initiate Payment',
    'operation',
    'ga',
    'payments-platform',
    '1',
    'Submit a payment instruction. Idempotent on a client-supplied key, because a retried instruction that pays twice is the expensive failure.',
    ['payments-api'],
  ),
  entry(
    'quote-fx-rate',
    'Quote FX Rate',
    'operation',
    'beta',
    'markets-platform',
    '1',
    'Request an executable rate for a pair, amount and tenor. The quote carries its own expiry.',
    ['fx-pricing-api'],
  ),
  entry(
    'screen-counterparty',
    'Screen Counterparty',
    'operation',
    'ga',
    'financial-crime',
    '1',
    'Run a name against the sanctions and adverse-media lists and return the match set, never a decision.',
    ['kyc-screening-service'],
  ),
  entry(
    'publish-notification',
    'Publish Notification',
    'operation',
    'ga',
    'messaging-platform',
    '1',
    'Hand an event to the notification service and let preference and entitlement decide the channel it comes out on.',
    ['notification-service'],
  ),
  entry(
    'resolve-entitlements',
    'Resolve Entitlements',
    'operation',
    'ga',
    'identity-platform',
    '1',
    'Return the permissions a principal holds for a client and legal entity, which is what a channel asks before it renders a control.',
    ['entitlements-service'],
  ),
];

/** Look a roster entry up by its handle. */
export function catalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find((row) => row.name === name);
}

/** The roster entries that declare a dependency on `name`. */
export function dependentsOf(name: string): string[] {
  return CATALOG.filter((row) => row.depends_on.includes(name)).map((row) => row.name);
}

/**
 * The roster narrowed by the filters the list endpoint accepts.
 *
 * Filtering here rather than in a page is the point: the real endpoint narrows
 * server-side, and a mock that returned everything would let a component pass
 * while filtering in the browser.
 */
export function filterCatalog({
  lifecycle,
  entityType,
}: {
  lifecycle?: string | null;
  entityType?: string | null;
}): CatalogEntry[] {
  return CATALOG.filter(
    (row) =>
      (!lifecycle || row.lifecycle === lifecycle) &&
      (!entityType || row.entity_type === entityType),
  );
}

/**
 * Rank the roster against a query.
 *
 * Crude on purpose — a name hit outranks a summary hit, and that is all. It is
 * not pretending to be the server's hybrid retrieval; it exists so the results
 * on screen are recognisably about what was typed, which placeholder names could
 * never demonstrate.
 */
export function searchCatalog(q: string): CatalogEntry[] {
  const needle = q.trim().toLowerCase();
  if (needle === '') return [];
  const scored = CATALOG.map((row) => {
    const haystack = `${row.name} ${row.display_name}`.toLowerCase();
    if (haystack.includes(needle)) return { row, rank: 0 };
    if (row.summary.toLowerCase().includes(needle)) return { row, rank: 1 };
    if (row.owner.includes(needle)) return { row, rank: 2 };
    return null;
  }).filter((hit): hit is { row: CatalogEntry; rank: number } => hit !== null);

  return scored.sort((a, b) => a.rank - b.rank).map((hit) => hit.row);
}
