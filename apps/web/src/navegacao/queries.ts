import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFolderRequest,
  FileSummaryResponse,
  FolderContentsResponse,
  FolderResponse,
  RenameFileRequest,
} from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import {
  fileSummaryResponseSchema,
  folderContentsResponseSchema,
  folderResponseSchema,
} from '../lib/schemas';

const FOLDER_CONTENTS_KEY = 'folder-contents';

/** `folderId: null` = raiz da unidade — chave `['folder-contents', 'root']` (design.md D5). */
export function folderContentsQueryKey(folderId: string | null) {
  return [FOLDER_CONTENTS_KEY, folderId ?? 'root'] as const;
}

/** `GET /folders/root/contents` ou `GET /folders/:id/contents` (design.md D5). */
export function useFolderContents(folderId: string | null) {
  return useQuery({
    queryKey: folderContentsQueryKey(folderId),
    queryFn: async () => {
      const path = folderId === null ? '/folders/root/contents' : `/folders/${folderId}/contents`;
      const raw = await apiClient.get<FolderContentsResponse>(path);
      return folderContentsResponseSchema.parse(raw);
    },
  });
}

/**
 * Toda mutation de gestão invalida as listagens em cache (design.md D5): sem
 * otimismo local, a tela sempre reflete o que o servidor confirmou — inclui o
 * caso de excluir a pasta corrente, cuja listagem-pai pode já estar em cache.
 */
function useInvalidateFolderContents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [FOLDER_CONTENTS_KEY] });
}

export function useCreateFolder() {
  const invalidate = useInvalidateFolderContents();
  return useMutation({
    mutationFn: async (body: CreateFolderRequest) => {
      const raw = await apiClient.post<FolderResponse>('/folders', body);
      return folderResponseSchema.parse(raw);
    },
    onSuccess: invalidate,
  });
}

export function useRenameFile() {
  const invalidate = useInvalidateFolderContents();
  return useMutation({
    mutationFn: async ({ fileId, ...body }: RenameFileRequest & { fileId: string }) => {
      const raw = await apiClient.patch<FileSummaryResponse>(`/files/${fileId}`, body);
      return fileSummaryResponseSchema.parse(raw);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteFile() {
  const invalidate = useInvalidateFolderContents();
  return useMutation({
    mutationFn: (fileId: string) => apiClient.delete<void>(`/files/${fileId}`),
    onSuccess: invalidate,
  });
}

export function useDeleteFolder() {
  const invalidate = useInvalidateFolderContents();
  return useMutation({
    mutationFn: (folderId: string) => apiClient.delete<void>(`/folders/${folderId}`),
    onSuccess: invalidate,
  });
}
