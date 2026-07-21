import { z } from 'zod';
import type {
  AuthenticatedIdentity,
  BatchUploadItemResult,
  BatchUploadUrlResponse,
  FileSummaryResponse,
  FolderContentsResponse,
  FolderResponse,
  SignedUrlResponse,
  ViewUrlResponse,
} from '@gdoc/shared';
import { FileAccessAction, UserRole } from '@gdoc/shared';

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

/** Espelha `SignedUrlResponse` (design.md D7, `web-visualizacao`). */
export const signedUrlResponseSchema: z.ZodType<SignedUrlResponse> = z.object({
  url: z.string(),
  expiresAt: z.string(),
  action: z.enum([FileAccessAction.VIEW, FileAccessAction.DOWNLOAD]),
});

/** Espelha `ViewUrlResponse` (união discriminada, design.md D7). */
export const viewUrlResponseSchema: z.ZodType<ViewUrlResponse> = z.discriminatedUnion(
  'previewAvailable',
  [
    z.object({
      previewAvailable: z.literal(true),
      url: z.string(),
      expiresAt: z.string(),
      action: z.enum([FileAccessAction.VIEW, FileAccessAction.DOWNLOAD]),
    }),
    z.object({
      previewAvailable: z.literal(false),
      reason: z.literal('unsupported_format'),
      download: z.object({ available: z.boolean() }),
    }),
  ],
);

/** Espelha `BatchUploadItemResult` (união discriminada em `ok`, design.md D8, `web-upload`). */
export const batchUploadItemResultSchema: z.ZodType<BatchUploadItemResult> = z.discriminatedUnion('ok', [
  z.object({
    fileName: z.string(),
    ok: z.literal(true),
    uploadUrl: z.string(),
    objectPath: z.string(),
    folderId: z.string().nullable(),
    expiresAt: z.string(),
  }),
  z.object({
    fileName: z.string(),
    ok: z.literal(false),
    error: z.string(),
  }),
]);

/** Espelha `BatchUploadUrlResponse` (design.md D8, `web-upload`). */
export const batchUploadUrlResponseSchema: z.ZodType<BatchUploadUrlResponse> = z.object({
  results: z.array(batchUploadItemResultSchema),
});
