import type { GrantResourceType, Permission } from './permissions.js';

/**
 * Tipo de evento notificado (change `expiracao-permissoes`, design.md D4/D6).
 * O canal nasceu genérico para a expiração de permissão; a change
 * `arquivo-geral-e-pendente-de-cadastro` é a primeira a usá-lo para outro
 * assunto.
 */
export const NotificationKind = {
  GRANT_CREATED: 'grant_created',
  GRANT_EXPIRING: 'grant_expiring',
  GRANT_EXPIRED: 'grant_expired',
  /**
   * Arquivo enviado sem os dados de controle exigidos ficou pendente de
   * cadastro (US 10.9). Destinado a **quem enviou**, com o arquivo como evento
   * de origem — a idempotência por `(destinatário, tipo, evento)` que o canal
   * já garante basta para que repetir a transferência não duplique o aviso.
   */
  REGISTRATION_PENDING: 'registration_pending',
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

/**
 * Payload do aviso de pendência de cadastro (US 10.9). Carrega o nome do
 * arquivo, e não só o identificador, para que o sino diga **qual** arquivo
 * completar sem uma segunda ida ao servidor — que, além de custar uma volta,
 * falharia justamente para quem já não alcança o arquivo.
 */
export interface RegistrationPendingNotificationPayload {
  fileId: string;
  fileName: string;
}

/**
 * Payload de uma notificação, discriminado pelo `kind` da notificação que o
 * carrega. Quem lê deve ramificar por `kind` antes de acessar campos — é o que
 * mantém o canal aberto a assuntos novos sem que cada leitor presuma concessão.
 */
export type NotificationPayload = GrantNotificationPayload | RegistrationPendingNotificationPayload;

export interface NotificationResponse {
  id: string;
  kind: NotificationKind;
  payload: NotificationPayload;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
}

export interface UnreadNotificationCountResponse {
  count: number;
}
