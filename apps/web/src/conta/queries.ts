import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChangePasswordRequest, MyProfileResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { myProfileResponseSchema } from '../lib/schemas';

const PROFILE_KEY = 'my-profile';

/** `GET /auth/profile` (US 1.3, cenário 5; design.md D6): dados cadastrais da pessoa autenticada, somente leitura. */
export function useMyProfile() {
  return useQuery({
    queryKey: [PROFILE_KEY],
    queryFn: async () => {
      const raw = await apiClient.get<MyProfileResponse>('/auth/profile');
      return myProfileResponseSchema.parse(raw);
    },
  });
}

/**
 * `POST /auth/password` (US 1.3). Sem `onSuccess` de invalidação de cache: a
 * senha digitada nunca deve sobreviver ao TanStack Query (design.md D7,
 * troca-de-senha) — o resultado da mutação é só sucesso/erro, entregue
 * direto ao formulário chamador.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => apiClient.post<void>('/auth/password', body),
  });
}
