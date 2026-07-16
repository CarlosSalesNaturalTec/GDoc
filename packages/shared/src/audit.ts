/**
 * Ação registrada em `audit_events` — superset de `FileAccessAction`
 * (visualizar/baixar) mais os eventos de gestão de arquivo (US 2.2:
 * renomear, substituir).
 */
export const AuditAction = {
  VIEW: 'view',
  DOWNLOAD: 'download',
  RENAME: 'rename',
  REPLACE: 'replace',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEvent {
  id: string;
  unitId: string;
  userId: string;
  fileId: string;
  action: AuditAction;
  createdAt: string;
}
