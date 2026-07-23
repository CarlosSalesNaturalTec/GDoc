import { UserRole } from '@gdoc/shared';
import { createPorts, type Ports } from '../ports/index.js';
import type { TenantContext } from '../ports/database-port.js';
import { reconcileFinalize } from '../lib/storage-reconcile.js';

// Contexto de sistema (manutenção, não requisição de usuário) — mesmo bypass
// de `global_admin` usado por `purge-trash`/`storage-events`. Cross-unit por
// ser rotina de manutenção; nenhum alcance de conteúdo por unidade é reaberto.
const SYSTEM_CTX: TenantContext = {
  unitId: '00000000-0000-0000-0000-000000000000',
  userId: '00000000-0000-0000-0000-000000000000',
  role: UserRole.GLOBAL_ADMIN,
};

interface PendingFileRow {
  id: string;
  status: string;
  object_path: string;
  pending_object_path: string | null;
}

export interface BackfillSummary {
  /** Arquivos promovidos a active/over_quota nesta execução. */
  reconciled: number;
  /** Objeto ainda ausente no bucket (upload nunca concluiu) — deixado pending. */
  missingObject: number;
  /** Falhas por item (não interrompem o restante). */
  failed: number;
}

/**
 * Backfill one-shot dos registros presos em `pending`/`replacing` (design.md
 * D4): para cada um, confere no storage se o objeto foi de fato finalizado e,
 * em caso positivo, aplica a MESMA reconciliação do endpoint de push
 * (`reconcileFinalize`) — promovendo a `active` e somando a cota. Idempotente
 * por status: como só percorre `pending`/`replacing` e a reconciliação promove
 * o status, reexecutar não soma cota em dobro.
 *
 * Upload novo finaliza no `object_path`; substituição em andamento finaliza no
 * `pending_object_path` — o caminho conferido no storage segue o status.
 */
export async function runBackfill(ports: Ports): Promise<BackfillSummary> {
  const summary: BackfillSummary = { reconciled: 0, missingObject: 0, failed: 0 };

  const stuck = await ports.database.withTenantTransaction(SYSTEM_CTX, async (client) => {
    const { rows } = await client.query<PendingFileRow>(
      `SELECT id, status, object_path, pending_object_path FROM files
       WHERE status IN ('pending', 'replacing')`,
    );
    return rows;
  });

  for (const file of stuck) {
    const objectPath =
      file.status === 'replacing' ? file.pending_object_path : file.object_path;
    if (!objectPath) {
      // 'replacing' sem pending_object_path é estado inconsistente — pula.
      summary.failed += 1;
      console.error(`backfill: arquivo ${file.id} em 'replacing' sem pending_object_path`);
      continue;
    }

    try {
      const stat = await ports.storage.statObject(objectPath);
      if (!stat) {
        // Objeto não existe no bucket: o upload nunca concluiu de fato — não há
        // o que reconciliar; a linha permanece pendente.
        summary.missingObject += 1;
        continue;
      }

      const result = await reconcileFinalize(ports, {
        objectPath,
        sizeBytes: stat.sizeBytes,
      });
      if (result.found) summary.reconciled += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`backfill: falha ao reconciliar arquivo ${file.id}`, err);
    }
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ports = createPorts();
  runBackfill(ports)
    .then(async (summary) => {
      console.log(
        `Backfill concluído: ${summary.reconciled} reconciliado(s), ` +
          `${summary.missingObject} sem objeto no storage, ${summary.failed} falha(s).`,
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
