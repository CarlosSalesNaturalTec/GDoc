import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUnitRequest, UnitResponse, UpdateUnitRequest } from '@gdoc/shared';
import { UnitStatus } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { unitListSchema } from '../lib/schemas';

const UNITS_KEY = 'units';

/**
 * `GET /units` (change `gestao-de-unidades`, `web-unidades`): lista de
 * unidades para uso administrativo. `onlyActive` alimenta o seletor de
 * unidade no cadastro de pessoas (só ativas, para não alocar em unidade
 * desativada — design.md D7).
 */
export function useUnits(options: { onlyActive?: boolean; enabled?: boolean } = {}) {
  const { onlyActive = false, enabled = true } = options;
  return useQuery({
    queryKey: [UNITS_KEY, { onlyActive }],
    enabled,
    queryFn: async () => {
      const path = onlyActive ? `/units?status=${UnitStatus.ACTIVE}` : '/units';
      const raw = await apiClient.get<UnitResponse[]>(path);
      return unitListSchema.parse(raw);
    },
  });
}

/** `POST /units` (`web-unidades`): cria unidade ativa; 409 = nome já em uso. */
export function useCreateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUnitRequest) => apiClient.post<UnitResponse>('/units', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [UNITS_KEY] }),
  });
}

/** `PATCH /units/:id` (`web-unidades`): renomear e/ou ativar/desativar. */
export function useUpdateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUnitRequest }) =>
      apiClient.patch<UnitResponse>(`/units/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [UNITS_KEY] }),
  });
}
