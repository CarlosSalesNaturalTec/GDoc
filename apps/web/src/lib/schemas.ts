import { z } from 'zod';
import type {
  AuthenticatedIdentity,
  FileSummaryResponse,
  FolderContentsResponse,
  FolderResponse,
} from '@gdoc/shared';
import { UserRole } from '@gdoc/shared';

/**
 * Valida a fronteira com a API, espelhando `@gdoc/shared` (fonte única de
 * DTOs — design.md D5). `z.ZodType<T>` amarra o schema ao tipo compartilhado:
 * se o DTO mudar sem o schema acompanhar, o `tsc` acusa a divergência.
 */
export const authenticatedIdentitySchema: z.ZodType<AuthenticatedIdentity> = z.object({
  id: z.string(),
  unitId: z.string(),
  role: z.enum([UserRole.COLLABORATOR, UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN]),
});

/** Espelha `FolderResponse` (design.md D8, `web-navegacao`). */
export const folderResponseSchema: z.ZodType<FolderResponse> = z.object({
  id: z.string(),
  unitId: z.string(),
  ownerId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  createdAt: z.string(),
});

/** Espelha `FileSummaryResponse` (design.md D8, `web-navegacao`). */
export const fileSummaryResponseSchema: z.ZodType<FileSummaryResponse> = z.object({
  id: z.string(),
  ownerId: z.string(),
  folderId: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  status: z.string(),
  createdAt: z.string(),
});

/** Espelha `FolderContentsResponse` (design.md D8, `web-navegacao`). */
export const folderContentsResponseSchema: z.ZodType<FolderContentsResponse> = z.object({
  folder: folderResponseSchema.nullable(),
  breadcrumb: z.array(folderResponseSchema),
  folders: z.array(folderResponseSchema),
  files: z.array(fileSummaryResponseSchema),
});
