import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { dashboardResponseSchema } from '../lib/schemas';

/** `GET /dashboard` (design.md D4): agregados do painel no alcance do administrador. Só leitura, sem mutations. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const raw = await apiClient.get<DashboardResponse>('/dashboard');
      return dashboardResponseSchema.parse(raw);
    },
  });
}
