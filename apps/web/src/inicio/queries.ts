import { useQuery } from '@tanstack/react-query';
import type { RecentDocumentsResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { recentDocumentsResponseSchema } from '../lib/schemas';

export const RECENT_DOCUMENTS_KEY = 'recent-documents';

/**
 * `GET /files/recent` (US 11.2) — recorte curto, sem parâmetros: o teto e a
 * janela são decisão do servidor (`config.recentDocuments`), não da tela. A
 * SPA nunca filtra o que recebe: o que chega aqui é exatamente o que a
 * resolução de acesso do servidor autorizou.
 */
export function useRecentDocuments() {
  return useQuery({
    queryKey: [RECENT_DOCUMENTS_KEY],
    queryFn: async () => {
      const raw = await apiClient.get<RecentDocumentsResponse>('/files/recent');
      return recentDocumentsResponseSchema.parse(raw);
    },
  });
}
