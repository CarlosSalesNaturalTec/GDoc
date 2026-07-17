/**
 * Verbo de permissão concedível sobre um recurso (Épico 4, US 4.1). Uma
 * linha em `grants` por (pessoa, recurso, verbo) — ver design.md D1.
 */
export const Permission = {
  VIEW: 'view',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  RENAME: 'rename',
  DELETE: 'delete',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Tipo do recurso concedível — pasta ou arquivo, sem herança entre eles (design.md D2). */
export const GrantResourceType = {
  FOLDER: 'folder',
  FILE: 'file',
} as const;

export type GrantResourceType = (typeof GrantResourceType)[keyof typeof GrantResourceType];

export interface CreateGrantRequest {
  subjectUserId: string;
  resourceType: GrantResourceType;
  resourceId: string;
  permissions: Permission[];
}

export interface GrantResponse {
  id: string;
  unitId: string;
  subjectUserId: string;
  resourceType: GrantResourceType;
  resourceId: string;
  permission: Permission;
  grantedBy: string;
  createdAt: string;
}

export interface GrantListResponse {
  grants: GrantResponse[];
}
