import type { FileAccessAction } from './storage.js';

export interface AuditEvent {
  id: string;
  unitId: string;
  userId: string;
  fileId: string;
  action: FileAccessAction;
  createdAt: string;
}
