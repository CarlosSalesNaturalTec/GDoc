import { z } from 'zod';
import type {
  AuditQueryResponse,
  AuthenticatedIdentity,
  BatchUploadItemResult,
  BatchUploadUrlResponse,
  DashboardResponse,
  FileRestoreResponse,
  FileSummaryResponse,
  FolderContentsResponse,
  FolderResponse,
  GrantListResponse,
  GrantResponse,
  PersonResponse,
  SearchFilesResponse,
  SignedUrlResponse,
  TrashListResponse,
  UnitResponse,
  ViewUrlResponse,
} from '@gdoc/shared';
import { FileAccessAction, FileCategory, GrantResourceType, Permission, PersonStatus, UnitStatus, UserRole } from '@gdoc/shared';

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

/** Espelha `SearchFilesResponse` (design.md D6, `web-busca`), reusando `fileSummaryResponseSchema`. */
export const searchFilesResponseSchema: z.ZodType<SearchFilesResponse> = z.object({
  files: z.array(fileSummaryResponseSchema),
});

/**
 * Schema mínimo para `GET /users` (design.md D6, `web-busca`): valida só os
 * campos usados pelo filtro de autor (id + nome), tolerando os demais campos
 * de `PersonResponse` que o `Select` não precisa.
 */
export const authorPersonSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
});
export const authorPersonListSchema = z.array(authorPersonSchema);

/** Espelha `GrantResponse` (design.md D6, `web-permissoes`): uma linha por (pessoa, verbo). */
export const grantResponseSchema: z.ZodType<GrantResponse> = z.object({
  id: z.string(),
  unitId: z.string(),
  subjectUserId: z.string(),
  resourceType: z.enum([GrantResourceType.FOLDER, GrantResourceType.FILE]),
  resourceId: z.string(),
  permission: z.enum([
    Permission.VIEW,
    Permission.DOWNLOAD,
    Permission.UPLOAD,
    Permission.RENAME,
    Permission.DELETE,
  ]),
  grantedBy: z.string(),
  createdAt: z.string(),
});

/** Espelha `GrantListResponse` (design.md D6, `web-permissoes`). */
export const grantListResponseSchema: z.ZodType<GrantListResponse> = z.object({
  grants: z.array(grantResponseSchema),
});

/** Espelha `TrashListResponse` (design.md D7, `web-lixeira`): item de raiz de exclusão. */
export const trashListResponseSchema: z.ZodType<TrashListResponse> = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum([GrantResourceType.FOLDER, GrantResourceType.FILE]),
      name: z.string(),
      deletedAt: z.string(),
      expiresAt: z.string(),
    }),
  ),
});

/**
 * Valida só o campo que a UI usa além de `FileSummaryResponse`
 * (`redirectedToRoot`, design.md D7, `web-lixeira`) — reusa
 * `fileSummaryResponseSchema` por interseção em vez de repetir os campos.
 */
export const fileRestoreResponseSchema: z.ZodType<FileRestoreResponse> = fileSummaryResponseSchema.and(
  z.object({ redirectedToRoot: z.boolean() }),
);

/** Espelha `PersonResponse` (design.md D7, `web-pessoas`) — fronteira de `GET/POST/PATCH /users`. */
export const personResponseSchema: z.ZodType<PersonResponse> = z.object({
  id: z.string(),
  unitId: z.string(),
  fullName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  workArea: z.string().nullable(),
  notes: z.string().nullable(),
  role: z.enum([UserRole.COLLABORATOR, UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN]),
  status: z.enum([PersonStatus.ACTIVE, PersonStatus.DISABLED]),
  createdAt: z.string(),
});

/** Espelha a listagem de `GET /users` (design.md D7, `web-pessoas`). */
export const personListSchema = z.array(personResponseSchema);

/** Espelha `UnitResponse` (change `gestao-de-unidades`, `web-unidades`) — fronteira de `GET/POST/PATCH /units`. */
export const unitResponseSchema: z.ZodType<UnitResponse> = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum([UnitStatus.ACTIVE, UnitStatus.DISABLED]),
  createdAt: z.string(),
});

/** Espelha a listagem de `GET /units`. */
export const unitListSchema = z.array(unitResponseSchema);

/** Espelha `DashboardResponse` (design.md D4, `web-painel`): agregados de `GET /dashboard`. */
export const dashboardResponseSchema: z.ZodType<DashboardResponse> = z.object({
  cards: z.object({
    totalFiles: z.number(),
    totalPeople: z.number(),
    usedBytes: z.number(),
    quotaUsedPct: z.number(),
  }),
  filesByType: z.array(
    z.object({
      category: z.enum([
        FileCategory.IMAGE,
        FileCategory.VIDEO,
        FileCategory.AUDIO,
        FileCategory.PDF,
        FileCategory.OFFICE,
        FileCategory.TEXT,
        FileCategory.OTHER,
      ]),
      count: z.number(),
    }),
  ),
  uploadsByMonth: z.array(
    z.object({
      month: z.string(),
      count: z.number(),
    }),
  ),
  storage: z.object({
    usedBytes: z.number(),
    quotaBytesPerUser: z.number(),
    userCount: z.number(),
    capacityBytes: z.number(),
    availableBytes: z.number(),
  }),
});

/** Espelha `AuditQueryResponse` (design.md D6, `web-auditoria`): acessos (`view`/`download`) de um arquivo. */
export const auditQueryResponseSchema: z.ZodType<AuditQueryResponse> = z.object({
  events: z.array(
    z.object({
      actor: z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
      }),
      action: z.enum(['view', 'download']),
      createdAt: z.string(),
    }),
  ),
});
