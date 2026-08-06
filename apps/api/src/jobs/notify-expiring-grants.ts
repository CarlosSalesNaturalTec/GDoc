import { GrantResourceType, NotificationKind, Permission, UserRole } from '@gdoc/shared';
import type { GrantNotificationPayload } from '@gdoc/shared';
import { config } from '../config.js';
import { createPorts, type Ports } from '../ports/index.js';
import type { DatabasePort, TenantContext } from '../ports/database-port.js';
import type { NotificationPort } from '../ports/notification-port.js';

// Papel de sistema (manutenção, não requisição de usuário), mesmo bypass de
// `global_admin` de `jobs/purge-trash.ts` — a `unitId` é irrelevante para o
// bypass da varredura cross-unit; cada notificação emitida depois usa a
// unidade real do grant/admin, nunca este placeholder.
const SYSTEM_CTX: TenantContext = {
  unitId: '00000000-0000-0000-0000-000000000000',
  userId: '00000000-0000-0000-0000-000000000000',
  role: UserRole.GLOBAL_ADMIN,
};

interface GrantGroupRow {
  unit_id: string;
  subject_user_id: string;
  resource_type: GrantResourceType;
  resource_id: string;
  expires_at: string;
  permissions: Permission[];
}

interface AdminRow {
  id: string;
}

export interface NotifySummary {
  expiringNotified: number;
  expiringFailed: number;
  cutNotified: number;
  cutFailed: number;
}

/**
 * `source_ref` ancorado em (recurso, vencimento) — design.md D5, mesmo
 * formato usado por `routes/grants.ts` para o aviso de concessão. Reusado
 * aqui para o aviso prévio (`grant_expiring`), à mesma pessoa: kinds
 * diferentes não colidem na unicidade `(recipient, kind, source_ref)`.
 */
function grantSourceRef(
  resourceType: GrantResourceType,
  resourceId: string,
  expiresAt: string,
): string {
  return `grant:${resourceType}:${resourceId}:${new Date(expiresAt).toISOString()}`;
}

/**
 * `source_ref` do aviso de corte (design.md D5/D6): inclui a **pessoa
 * afetada**, porque o destinatário aqui é a administração da unidade, não o
 * titular do grant — sem a pessoa no identificador, o corte de grants de
 * pessoas diferentes sobre o mesmo recurso e vencimento colapsaria num só
 * aviso, escondendo quem exatamente perdeu acesso.
 */
function grantExpiredSourceRef(
  resourceType: GrantResourceType,
  resourceId: string,
  expiresAt: string,
  subjectUserId: string,
): string {
  return `grant-expired:${resourceType}:${resourceId}:${new Date(expiresAt).toISOString()}:${subjectUserId}`;
}

function toPayload(group: GrantGroupRow, subjectUserId?: string): GrantNotificationPayload {
  return {
    resourceType: group.resource_type,
    resourceId: group.resource_id,
    permissions: group.permissions,
    expiresAt: new Date(group.expires_at).toISOString(),
    ...(subjectUserId ? { subjectUserId } : {}),
  };
}

/**
 * Rotina diária de avisos de expiração de permissão (US 4.3, design.md
 * D6/D7). Job separado do expurgo, com falha e cadência independentes: uma
 * falha aqui degrada avisos, nunca segurança — o corte de acesso já
 * aconteceu por predicado de consulta (`lib/access.ts`, design.md D1),
 * **antes** e **independentemente** de esta rotina rodar.
 *
 * Agrupa por (unidade, pessoa, recurso, vencimento) — um grant é uma linha
 * por verbo, então a mesma concessão administrativa (vários verbos, mesmo
 * prazo) precisa virar **um** aviso que os enumera, não um por verbo
 * (design.md D5). A idempotência real vem do `NotificationPort` (índice
 * único de dedup); esta rotina é propositalmente "burra" — não mantém
 * estado próprio de até onde já processou, e pode ser reexecutada a
 * qualquer momento sem duplicar aviso.
 */
export async function runNotifyExpiringGrants(
  ports: Pick<Ports, 'database' | 'notifications'>,
): Promise<NotifySummary> {
  const summary: NotifySummary = {
    expiringNotified: 0,
    expiringFailed: 0,
    cutNotified: 0,
    cutFailed: 0,
  };

  await notifyExpiring(ports.database, ports.notifications, summary);
  await notifyCut(ports.database, ports.notifications, summary);

  return summary;
}

async function notifyExpiring(
  database: DatabasePort,
  notifications: NotificationPort,
  summary: NotifySummary,
): Promise<void> {
  const groups = await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
    const { rows } = await client.query<GrantGroupRow>(
      `SELECT unit_id, subject_user_id, resource_type, resource_id, expires_at,
              array_agg(permission ORDER BY permission) AS permissions
       FROM grants
       WHERE expires_at IS NOT NULL
         AND expires_at > now()
         AND expires_at <= now() + ($1 * interval '1 day')
       GROUP BY unit_id, subject_user_id, resource_type, resource_id, expires_at`,
      [config.grantExpiringNoticeWindowDays],
    );
    return rows;
  });

  for (const group of groups) {
    try {
      await notifications.notify({
        unitId: group.unit_id,
        recipientUserId: group.subject_user_id,
        kind: NotificationKind.GRANT_EXPIRING,
        payload: toPayload(group),
        sourceRef: grantSourceRef(group.resource_type, group.resource_id, group.expires_at),
      });
      summary.expiringNotified += 1;
    } catch (err) {
      summary.expiringFailed += 1;
      console.error(
        `notify-expiring-grants: falha ao avisar vencimento próximo (recurso ${group.resource_id})`,
        err,
      );
    }
  }
}

async function notifyCut(
  database: DatabasePort,
  notifications: NotificationPort,
  summary: NotifySummary,
): Promise<void> {
  const groups = await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
    const { rows } = await client.query<GrantGroupRow>(
      `SELECT unit_id, subject_user_id, resource_type, resource_id, expires_at,
              array_agg(permission ORDER BY permission) AS permissions
       FROM grants
       WHERE expires_at IS NOT NULL AND expires_at <= now()
       GROUP BY unit_id, subject_user_id, resource_type, resource_id, expires_at`,
    );
    return rows;
  });

  for (const group of groups) {
    // Administração **da unidade do grant** apenas — deliberadamente sem
    // `global_admin` (design.md D6): a trava do bypass que impede o admin
    // global de ser "olho universal" sobre conteúdo/auditoria de outra
    // unidade vale também para a lista de acessos cortados dela.
    const admins = await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
      const { rows } = await client.query<AdminRow>(
        `SELECT id FROM users WHERE unit_id = $1 AND role = 'unit_admin'`,
        [group.unit_id],
      );
      return rows;
    });

    for (const admin of admins) {
      try {
        await notifications.notify({
          unitId: group.unit_id,
          recipientUserId: admin.id,
          kind: NotificationKind.GRANT_EXPIRED,
          payload: toPayload(group, group.subject_user_id),
          sourceRef: grantExpiredSourceRef(
            group.resource_type,
            group.resource_id,
            group.expires_at,
            group.subject_user_id,
          ),
        });
        summary.cutNotified += 1;
      } catch (err) {
        summary.cutFailed += 1;
        console.error(
          `notify-expiring-grants: falha ao avisar corte (recurso ${group.resource_id})`,
          err,
        );
      }
    }
    // A pessoa afetada NÃO é avisada de novo no corte (design.md D6) — já
    // recebeu o aviso prévio; avisar duas vezes transformaria o canal em ruído.
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ports = createPorts();
  runNotifyExpiringGrants(ports)
    .then(async (summary) => {
      console.log(
        `Avisos de expiração concluídos: ${summary.expiringNotified} aviso(s) prévio(s) (${summary.expiringFailed} falha(s)), ` +
          `${summary.cutNotified} aviso(s) de corte (${summary.cutFailed} falha(s)).`,
      );
      await ports.database.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await ports.database.close();
      process.exit(1);
    });
}
