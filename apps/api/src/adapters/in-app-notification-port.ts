import { UserRole } from '@gdoc/shared';
import type { DatabasePort } from '../ports/database-port.js';
import type { NotificationPort, NotifyInput } from '../ports/notification-port.js';

/**
 * Adapter in-app do `NotificationPort` (design.md D4/D5): persiste em
 * `notifications`, tabela tenant-scoped com RLS (migração 0013). O `INSERT`
 * roda dentro de uma transação com o contexto de tenant mínimo necessário
 * para passar pelo `WITH CHECK` da policy — o papel não importa para a
 * checagem (que compara só `unit_id`), então usamos `collaborator` como
 * valor neutro em vez do bypass de `global_admin`.
 *
 * `ON CONFLICT ... DO NOTHING` sobre o índice único de dedup absorve a
 * colisão de reemitir o mesmo `(recipientUserId, kind, sourceRef)` — a
 * idempotência exigida por design.md D5 é uma propriedade do `INSERT`, não
 * de uma checagem prévia.
 */
export class InAppNotificationPort implements NotificationPort {
  constructor(private readonly database: DatabasePort) {}

  async notify(input: NotifyInput): Promise<void> {
    await this.database.withTenantTransaction(
      { unitId: input.unitId, userId: input.recipientUserId, role: UserRole.COLLABORATOR },
      async (client) => {
        await client.query(
          `INSERT INTO notifications (unit_id, recipient_user_id, kind, payload, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (recipient_user_id, kind, source_ref) DO NOTHING`,
          [
            input.unitId,
            input.recipientUserId,
            input.kind,
            JSON.stringify(input.payload),
            input.sourceRef,
          ],
        );
      },
    );
  }
}
