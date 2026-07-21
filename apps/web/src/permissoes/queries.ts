import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateGrantRequest, GrantListResponse, GrantResourceType } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { grantListResponseSchema } from '../lib/schemas';

const GRANTS_KEY = 'grants';

/** `GET /grants` é sempre por recurso — a chave inclui tipo + id (design.md D1). */
function grantsQueryKey(resourceType: GrantResourceType, resourceId: string) {
  return [GRANTS_KEY, resourceType, resourceId] as const;
}

/**
 * `GET /grants?resourceType=&resourceId=` (design.md D4): concessões vigentes
 * de um recurso. `enabled` evita a chamada antes do diálogo abrir — o hook
 * roda incondicionalmente no componente, mesmo com o `Modal` fechado.
 */
export function useGrants(resourceType: GrantResourceType, resourceId: string, enabled = true) {
  return useQuery({
    queryKey: grantsQueryKey(resourceType, resourceId),
    enabled,
    queryFn: async () => {
      const raw = await apiClient.get<GrantListResponse>(
        `/grants?resourceType=${resourceType}&resourceId=${resourceId}`,
      );
      return grantListResponseSchema.parse(raw);
    },
  });
}

/** `POST /grants` (design.md D3): um ou mais verbos numa só chamada, idempotente no servidor. */
export function useCreateGrant(resourceType: GrantResourceType, resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrantRequest) => apiClient.post<GrantListResponse>('/grants', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: grantsQueryKey(resourceType, resourceId) }),
  });
}

/** `DELETE /grants/:id` (design.md D4): remove só o verbo daquela linha. */
export function useRevokeGrant(resourceType: GrantResourceType, resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => apiClient.delete<void>(`/grants/${grantId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: grantsQueryKey(resourceType, resourceId) }),
  });
}
