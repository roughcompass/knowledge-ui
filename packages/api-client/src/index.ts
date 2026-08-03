export {
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
  type ErrorEnvelope,
  type ErrorItem,
  type KnownErrorCode,
} from './errors';

export {
  fetchMetricsText,
  probeLiveness,
  probeReadiness,
  type Liveness,
  type ProbeOptions,
  type Readiness,
} from './ops';

export {
  gaugeValue,
  histogramQuantile,
  parsePrometheusText,
  sumByLabel,
  sumFamily,
  type MetricFamily,
  type MetricSample,
  type MetricType,
  type MetricsSnapshot,
} from './metrics/parse';

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

export { CursorStack, filterSignature } from './cursor';

export {
  LIFECYCLE_STATES,
  useAuditLog,
  useCapabilities,
  useCapability,
  useLiveness,
  useMetrics,
  useReadiness,
  useSearch,
  useWhoami,
  type AuditParams,
  type AuditResponse,
  type AuditRow,
  type CapabilityListParams,
  type CapabilityListResponse,
  type EntityRef,
  type Lifecycle,
  type SearchHit,
  type SearchParams,
  type SearchResponse,
  type WhoAmI,
} from './hooks';

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
} from './admin';

export { useCreateSyncSource, usePatchSyncSource, useTriggerSync } from './mutations';

export type { components, paths } from './generated/registry';
