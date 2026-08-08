/**
 * The audit log.
 *
 * Gated on the auditor role by exact match, with no admin bypass. Because the
 * server resolves a principal to exactly one role by precedence and auditor sits
 * lowest, a principal holding both admin and auditor loses this — so being
 * refused here is a normal server constraint rather than a mistake, and the
 * screen says which role would work.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { RegistryClient } from './client';
import type { components } from './generated/contextplane';
import { queryKeys, type KeyScope } from './keys';
import { clampPageSize, compact, toApiTimestamp } from './params';
import { LIST_OPTIONS } from './queryDefaults';

type Schemas = components['schemas'];

export type AuditRow = Schemas['AuditRow'];

export interface AuditParams {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date | string;
  to?: Date | string;
  cursor?: string | null;
  pageSize?: number;
}

export interface AuditResponse {
  items: AuditRow[];
  next_cursor: string | null;
}

export function useAuditLog(
  client: RegistryClient,
  scope: KeyScope,
  params: AuditParams,
  options: { enabled?: boolean } = {},
): UseQueryResult<AuditResponse> {
  const query = compact({
    cursor: params.cursor ?? undefined,
    page_size: clampPageSize('audit', params.pageSize),
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    // `from`/`to` are the query aliases; the server's own field names differ.
    from: params.from ? toApiTimestamp(params.from) : undefined,
    to: params.to ? toApiTimestamp(params.to) : undefined,
  });

  return useQuery({
    queryKey: queryKeys.audit(scope, query),
    queryFn: ({ signal }) => client.request<AuditResponse>('/v1/admin/audit', { query, signal }),
    enabled: options.enabled ?? true,
    // A 403 here means the role is wrong, which retrying cannot fix.
    retry: false,
    ...LIST_OPTIONS,
  });
}
