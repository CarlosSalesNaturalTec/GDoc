import { useMutation } from '@tanstack/react-query';
import type { SignedUrlResponse, ViewUrlResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { signedUrlResponseSchema, viewUrlResponseSchema } from '../lib/schemas';

/**
 * `POST /files/:id/view-url` audita na emissão (design.md D3) — por isso é
 * `useMutation`, não `useQuery`: sem cache/`staleTime`, cada chamada é um novo
 * acesso.
 */
export function useViewUrl() {
  return useMutation({
    mutationFn: async (fileId: string) => {
      const raw = await apiClient.post<ViewUrlResponse>(`/files/${fileId}/view-url`);
      return viewUrlResponseSchema.parse(raw);
    },
  });
}

/** `POST /files/:id/download-url` (design.md D3) — mesma razão de ser mutation. */
export function useDownloadUrl() {
  return useMutation({
    mutationFn: async (fileId: string) => {
      const raw = await apiClient.post<SignedUrlResponse>(`/files/${fileId}/download-url`);
      return signedUrlResponseSchema.parse(raw);
    },
  });
}
