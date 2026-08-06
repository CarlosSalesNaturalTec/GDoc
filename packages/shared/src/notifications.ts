import type { GrantResourceType, Permission } from './permissions.js';

/**
 * Tipo de evento notificado (change `expiracao-permissoes`, design.md D4/D6).
 * O canal nasce genérico, mas nesta fatia só a expiração de permissão o usa.
 */
export const NotificationKind = {
  GRANT_CREATED: 'grant_created',
  GRANT_EXPIRING: 'grant_expiring',
  GRANT_EXPIRED: 'grant_expired',
} as const;

export type NotificationKind = (typeof NotificationKind)[keyof typeof NotificationKind];

/**
 * Payload de notificação relativa a concessão. O evento de origem é
 * (resourceType, resourceId, expiresAt) — design.md D5 — por isso o payload
 * comporta a **lista de verbos** afetados em vez de um por notificação:
 * conceder vários verbos sobre o mesmo recurso e prazo produz uma única
 * notificação que os enumera. `subjectUserId` só é preenchido no aviso de
 * corte (`grant_expired`), destinado à administração da unidade, para
 * identificar a pessoa cujo acesso foi encerrado (design.md D6).
 */
export interface GrantNotificationPayload {
  resourceType: GrantResourceType;
  resourceId: string;
  permissions: Permission[];
  expiresAt: string;
  subjectUserId?: string;
}

export interface NotificationResponse {
  id: string;
  kind: NotificationKind;
  payload: GrantNotificationPayload;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
}

export interface UnreadNotificationCountResponse {
  count: number;
}
