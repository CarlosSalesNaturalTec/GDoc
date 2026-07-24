import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePersonRequest, PersonResponse, ResetPasswordResponse, UpdatePersonRequest } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { personListSchema, resetPasswordResponseSchema } from '../lib/schemas';

const USERS_KEY = 'users';

/** `GET /users` (design.md D7): pessoas do alcance do administrador (RLS por `unit_id`). */
export function useUsers() {
  return useQuery({
    queryKey: [USERS_KEY],
    queryFn: async () => {
      const raw = await apiClient.get<PersonResponse[]>('/users');
      return personListSchema.parse(raw);
    },
  });
}

/** `POST /users` (design.md D2/D7): cadastro sempre na unidade do admin logado — sem `unitId`. */
export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonRequest) => apiClient.post<PersonResponse>('/users', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

/** `PATCH /users/:id` (design.md D3/D5/D7): perfil, papel e status — nunca senha. */
export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePersonRequest }) =>
      apiClient.patch<PersonResponse>(`/users/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

/**
 * `POST /users/:id/password` (US 1.4; design.md (troca-de-senha) D7): a senha
 * gerada vai direto ao modal chamador, via valor de retorno da mutação — sem
 * `queryKey`, para nunca sobreviver no cache do TanStack Query.
 */
export function useResetPersonPassword() {
  return useMutation({
    mutationFn: async (id: string) => {
      const raw = await apiClient.post<ResetPasswordResponse>(`/users/${id}/password`);
      return resetPasswordResponseSchema.parse(raw);
    },
  });
}
