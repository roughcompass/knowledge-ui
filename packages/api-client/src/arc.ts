/**
 * Authorized reads over retained ARC resolution receipts.
 *
 * There is deliberately no browser helper for challenge issuance or resolution.
 * Those operations require a registered host identity and a host-signed
 * attestation; putting signing material in this client would erase the trust
 * boundary ARC exists to enforce. The UI may inspect a receipt produced by a real
 * host, and it may read the explanation retained with that run.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { RegistryError } from './errors';
import { queryKeys, type KeyScope } from './keys';

export interface ArcSelectedDirective {
  artifact_id: string;
  revision_id: string;
  directive_id: string;
  is_mandatory: boolean;
  was_omitted: boolean;
  omission_reason: string | null;
  source_locator: string | null;
  source_revision_locator: string | null;
  content_digest: string | null;
  audience_redacted: boolean;
}

/** Mirrors `ReceiptReader.get_receipt()` in the contextplane. */
export interface ArcReceipt {
  receipt_id: string;
  tenant_id: string;
  actor_id: string;
  host_id: string | null;
  session_id: string | null;
  manifest_fingerprint: string;
  attestation_id: string | null;
  resolution_status: string;
  selection_engine_version: string;
  registry_build_revision: string;
  canonical_profile_versions: unknown;
  selection_config_digest: string;
  evaluated_at: string;
  freshness_basis: unknown;
  blocked_reasons: string[];
  degraded_reasons: string[];
  mandatory_directive_count: number;
  rendered_content_bytes: number;
  budget_limit_bytes: number;
  integrity_state: string;
  selected: ArcSelectedDirective[];
}

export interface ArcReceiptEvent {
  sequence: number;
  event_type: string;
  event_source: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Mirrors `ReceiptReader.explain()`; this is stored history, never a rerun. */
export interface ArcReceiptExplanation {
  receipt_id: string;
  resolution_status: string;
  evaluated_at: string;
  selection_engine_version: string;
  selection_config_digest: string;
  blocked_reasons: string[];
  degraded_reasons: string[];
  budget: {
    rendered_content_bytes: number;
    budget_limit_bytes: number;
  };
  selected: ArcSelectedDirective[];
  events: ArcReceiptEvent[];
  integrity_state: string;
}

export function useArcReceipt(
  client: RegistryClient,
  scope: KeyScope,
  receiptId: string | undefined,
): UseQueryResult<ArcReceipt, RegistryError> {
  return useQuery({
    queryKey: queryKeys.arcReceipt(scope, receiptId ?? ''),
    enabled: Boolean(receiptId),
    queryFn: ({ signal }) =>
      client.request<ArcReceipt>(`/v1/arc/receipts/${encodeURIComponent(receiptId as string)}`, {
        signal,
      }),
  });
}

export function useArcReceiptExplanation(
  client: RegistryClient,
  scope: KeyScope,
  receiptId: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<ArcReceiptExplanation, RegistryError> {
  return useQuery({
    queryKey: queryKeys.arcReceiptExplanation(scope, receiptId ?? ''),
    enabled: Boolean(receiptId) && (options.enabled ?? true),
    queryFn: ({ signal }) =>
      client.request<ArcReceiptExplanation>(
        `/v1/arc/receipts/${encodeURIComponent(receiptId as string)}/explain`,
        { signal },
      ),
  });
}
