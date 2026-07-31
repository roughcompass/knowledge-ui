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

export { PAGE_LIMITS, clampPageSize, compact, toApiTimestamp, type PagedEndpoint } from './params';

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

export type { components, paths } from './generated/registry';
