import { useQuery } from '@tanstack/react-query';
import type { AuditQueryResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { auditQueryResponseSchema } from '../lib/schemas';

/**
 * `GET /files/:id/audit` (design.md D3): acessos (`view`/`download`) de um
 * arquivo — leitura pura, sem efeito colateral (a rota é um SELECT, não
 * grava evento). `enabled` evita a chamada antes do modal abrir, igual a
 * `useGrants(resourceType, resourceId, open)`.
 */
export function useFileAudit(fileId: string, open: boolean) {
  return useQuery({
    queryKey: ['file-audit', fileId],
    enabled: open && !!fileId,
    queryFn: async () => {
      const raw = await apiClient.get<AuditQueryResponse>(`/files/${fileId}/audit`);
      return auditQueryResponseSchema.parse(raw);
    },
  });
}
