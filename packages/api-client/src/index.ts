/**
 * The public surface of the API client, grouped the way the modules are.
 *
 * Three tiers, and the order below follows them: the transport and its error
 * model, the shared request and cache plumbing, then one module per API domain.
 * A new domain gets its own module and its own block here rather than joining an
 * existing one — the two files this replaced had grown to five and three
 * unrelated domains apiece, and the second was named `hooks.ts` while three of
 * its siblings were also hooks.
 *
 * Everything is a named re-export. A star export would make this file's contents
 * depend on what happens to be exported downstream, which is how a barrel stops
 * being a statement about the package's surface.
 */

// -- transport --------------------------------------------------------------

export {
  DEFAULT_TIMEOUT_MS,
  createRegistryClient,
  type QueryParams,
  type QueryValue,
  type RegistryClient,
  type RegistryClientOptions,
  type RequestOptions,
} from './client';

export {
  RegistryError,
  fieldErrors,
  formErrors,
  toNetworkError,
  toRegistryError,
  toTimeoutError,
  type ErrorEnvelope,
  type ErrorItem,
  type KnownErrorCode,
} from './errors';

// -- request and cache plumbing ---------------------------------------------

export { queryKeys, type KeyScope } from './keys';

export {
  IDEMPOTENCY_HEADER,
  PAGE_LIMITS,
  clampPageSize,
  compact,
  newIdempotencyKey,
  toApiTimestamp,
  type PagedEndpoint,
} from './params';

export { LIST_OPTIONS } from './queryDefaults';

export { CursorStack, filterSignature } from './cursor';

// -- domains ----------------------------------------------------------------

export { useWhoami, type WhoAmI } from './identity';

export {
  LIFECYCLE_STATES,
  useCapabilities,
  useCapability,
  type CapabilityListParams,
  type CapabilityListResponse,
  type EntityRef,
  type Lifecycle,
} from './catalog';

export {
  useSearch,
  type SearchCitation,
  type SearchHit,
  type SearchParams,
  type SearchResponse,
} from './search';

export {
  CONTEXT_PROBE_SOURCES,
  contextProbeItemId,
  runContextProbe,
  useContextProbe,
  type CatalogProbeResult,
  type ClaimProbeResult,
  type ContextProbeRequest,
  type ContextProbeResult,
  type ContextProbeSource,
  type WorkspaceProbeResult,
} from './contextProbe';

export {
  useArcReceipt,
  useArcReceiptExplanation,
  type ArcReceipt,
  type ArcReceiptEvent,
  type ArcReceiptExplanation,
  type ArcSelectedDirective,
} from './arc';

export { useAuditLog, type AuditParams, type AuditResponse, type AuditRow } from './audit';

export {
  describeScope,
  processScopeCaveat,
  useLiveness,
  useOperationalHealth,
  useReadiness,
  type OperationalHealth,
  type OperationalReading,
} from './operationalHealth';

export {
  probeLiveness,
  probeReadiness,
  type Liveness,
  type ProbeOptions,
  type Readiness,
} from './ops';

export {
  useAdopt,
  useAdoption,
  useUnadopt,
  type Adoption,
  type AdoptInput,
  type AdoptionListResponse,
} from './adoptions';

export {
  EVENT_KINDS,
  useCreateSubscription,
  useDeleteSubscription,
  usePatchSubscription,
  useSubscriptions,
  type EventKind,
  type Subscription,
  type SubscriptionCreate,
  type SubscriptionPatch,
} from './subscriptions';

export {
  NOTIFICATION_STATUSES,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationItem,
  type NotificationListResponse,
  type NotificationParams,
  type NotificationStatus,
} from './notifications';

export {
  CLAIM_PERSONAS,
  DEFAULT_CLAIM_PERSONA,
  confidenceBand,
  recallCaveat,
  uncitedClaims,
  useClaim,
  useClaimSearch,
  useClaims,
  type Citation,
  type Claim,
  type ClaimPersona,
  type ClaimQuery,
  type ClaimSearchQuery,
  type ConfidenceBand,
} from './memory';

export {
  TRAVERSAL_DEPTHS,
  edgesByRelationship,
  traversalCaveats,
  useBlastRadius,
  useDependencies,
  useDependents,
  type Dependencies,
  type EdgeRef,
  type Traversal,
  type TraversalDepth,
  type TraversalQuery,
} from './impact';

export {
  WORST_DAILY_P95_CAVEAT,
  WORST_DAILY_P95_LABEL,
  daysWithoutTraffic,
  describeWindow,
  surfaceReach,
  useOwnedCapabilityUsage,
  useUsageByCapability,
  useUsageByTool,
  useUsageSeries,
  useUsageSummary,
  windowSubstituted,
  type CapabilityRanking,
  type DailyPoint,
  type DailySeries,
  type OwnedCapabilityUsage,
  type SurfaceReach,
  type SurfaceSummary,
  type ToolRanking,
  type UsageSummary,
  type UsageWindow,
} from './usage';

export {
  SYNC_RUN_STATUSES,
  SYNC_SOURCE_TYPES,
  useSyncRuns,
  useSyncSource,
  useSyncSources,
  type SupersededFact,
  type SyncRun,
  type SyncRunParams,
  type SyncRunStatus,
  type SyncSource,
  type SyncSourceCreate,
  type SyncSourcePatch,
  type SyncSourceType,
  type TriggerReceipt,
} from './adminSync';

export { useCreateSyncSource, usePatchSyncSource, useTriggerSync } from './mutations';

export {
  WORKSPACE_ENTRY_KINDS,
  WORKSPACE_OWNER_KINDS,
  useCreateWorkspace,
  useCreateWorkspaceEntry,
  useDeleteWorkspace,
  useDeleteWorkspaceEntry,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaceEntries,
  useWorkspaces,
  type Workspace,
  type WorkspaceCreate,
  type WorkspaceEntry,
  type WorkspaceEntryCreate,
  type WorkspaceEntryKind,
  type WorkspaceEntryListResponse,
  type WorkspaceEntryParams,
  type WorkspaceEntryWarning,
  type WorkspaceListParams,
  type WorkspaceListResponse,
  type WorkspaceOwnerKind,
  type WorkspacePatch,
} from './workspaces';

export type { components, paths } from './generated/registry';

export {
  GRAPH_VOCABULARY_KINDS,
  PROJECTION_DIRECTIONS,
  useCapabilityTypes,
  useEdgePropertySchemas,
  useGraphProjection,
  useVocabulary,
  type CapabilityTypeSchema,
  type EdgePropertySchema,
  type GraphEdge,
  type GraphVocabularyKind,
  type ProjectionDirection,
  type ProjectionParams,
  type ProjectionResponse,
  type VocabularyValue,
} from './graph';
