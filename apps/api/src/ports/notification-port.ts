import type { GrantNotificationPayload, NotificationKind } from '@gdoc/shared';

export interface NotifyInput {
  unitId: string;
  recipientUserId: string;
  kind: NotificationKind;
  payload: GrantNotificationPayload;
  /**
   * Identificador do evento de origem, usado para deduplicação (design.md
   * D5). Para avisos de concessão, é composto de `(recurso, vencimento)` —
   * **nunca** do id do grant nem do instante da execução: é o que colapsa
   * vários verbos concedidos juntos numa única notificação, e o que faz uma
   * mudança de prazo notificar de novo.
   */
  sourceRef: string;
}

/**
 * Seam de emissão de notificação (design.md D4). A regra de negócio (rota de
 * concessão, rotina de avisos) decide **quem** avisar e **quando**, sem
 * conhecer o meio de entrega; a implementação ativa — escolhida em
 * `ports/index.ts::createPorts()` — decide **como** entregar. Nesta fatia a
 * única implementação é in-app; um adapter de e-mail entra depois como uma
 * segunda implementação desta mesma interface, sem tocar a regra.
 */
export interface NotificationPort {
  /**
   * Emite a notificação. Idempotente por construção: reemitir o mesmo
   * `(recipientUserId, kind, sourceRef)` não SHALL criar duplicata
   * (design.md D5).
   */
  notify(input: NotifyInput): Promise<void>;
}
