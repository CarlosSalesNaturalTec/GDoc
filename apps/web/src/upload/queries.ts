import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BatchUploadUrlRequest, BatchUploadUrlResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { batchUploadUrlResponseSchema } from '../lib/schemas';
import { FOLDER_CONTENTS_KEY } from '../navegacao/queries';

/**
 * `POST /files/upload-urls` — uma única chamada por lote, cota reservada
 * atomicamente no servidor (design.md D1/D3). Arquivo único também usa o
 * lote (lote de 1) — nunca o endpoint singular.
 */
export function useRequestUploadUrls() {
  return useMutation({
    mutationFn: async (body: BatchUploadUrlRequest) => {
      const raw = await apiClient.post<BatchUploadUrlResponse>('/files/upload-urls', body);
      return batchUploadUrlResponseSchema.parse(raw);
    },
  });
}

/** Reusa a chave `folder-contents` da Fatia 2: PUT concluído invalida a listagem (design.md D6). */
export function useInvalidateFolderContents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [FOLDER_CONTENTS_KEY] });
}
