import { GrantResourceType, UserRole } from '@gdoc/shared';
import { config } from '../config.js';
import { createPorts, type Ports } from '../ports/index.js';
import type { DatabasePort, TenantContext } from '../ports/database-port.js';
import type { StoragePort } from '../ports/storage-port.js';

// Papel de sistema (manutenção, não requisição de usuário) — mesmo bypass
// de `global_admin` usado por `attachTenantContext`/`storage-events.ts`; a
// `unitId` é irrelevante para o bypass (a policy RLS concede por role, não
// por unidade, quando `app.user_role = 'global_admin'`).
const SYSTEM_CTX: TenantContext = {
  unitId: '00000000-0000-0000-0000-000000000000',
  userId: '00000000-0000-0000-0000-000000000000',
  role: UserRole.GLOBAL_ADMIN,
};

interface ExpiredFileRow {
  id: string;
  owner_id: string;
  object_path: string;
  pending_object_path: string | null;
  size_bytes: string | null;
}

interface LeafFolderRow {
  id: string;
}

export interface PurgeSummary {
  purgedFiles: number;
  failedFiles: number;
  purgedFolders: number;
  failedFolders: number;
}

/**
 * Expurgo permanente do que está na lixeira há mais de `TRASH_RETENTION_DAYS`
 * (design.md D7). Roda sob contexto de sistema (bypass `global_admin`),
 * cross-unit — é manutenção, não uma rota de usuário; nenhum alcance de
 * conteúdo por unidade é reaberto (`hasAccess`/`visibleResourceClause`
 * continuam travando as rotas de usuário, ver `lib/access.ts`).
 *
 * Por arquivo: bytes → cota → auditoria → grants → linha, nessa ordem, e
 * tolerante a falha por item — uma falha em `deleteObject` interrompe só
 * aquele item (a linha permanece, reentra no próximo ciclo); os passos de
 * banco só rodam depois que os bytes já foram removidos ("bytes antes de
 * linha": nunca uma linha viva aponta para bytes já apagados).
 *
 * Pastas por último, folhas primeiro — respeita o FK `parent_id` sem
 * depender de `ON DELETE CASCADE` nessa tabela.
 */
export async function runPurge(ports: Pick<Ports, 'database' | 'storage'>): Promise<PurgeSummary> {
  const summary: PurgeSummary = { purgedFiles: 0, failedFiles: 0, purgedFolders: 0, failedFolders: 0 };

  await purgeExpiredFiles(ports.database, ports.storage, summary);
  await purgeExpiredFolders(ports.database, summary);

  return summary;
}

async function purgeExpiredFiles(database: DatabasePort, storage: StoragePort, summary: PurgeSummary): Promise<void> {
  const expired = await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
    const { rows } = await client.query<ExpiredFileRow>(
      `SELECT id, owner_id, object_path, pending_object_path, size_bytes FROM files
       WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 * interval '1 day')`,
      [config.trashRetentionDays],
    );
    return rows;
  });

  for (const file of expired) {
    try {
      // 1. Bytes primeiro (idempotente — design.md D8): também o objeto
      // órfão de uma substituição abandonada (`pending_object_path`), se
      // houver.
      await storage.deleteObject(file.object_path);
      if (file.pending_object_path) {
        await storage.deleteObject(file.pending_object_path);
      }

      await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
        // 2. Cota devolvida ao dono (design.md D6).
        await client.query('UPDATE users SET storage_used_bytes = storage_used_bytes - $1 WHERE id = $2', [
          Number(file.size_bytes ?? '0'),
          file.owner_id,
        ]);
        // 3. Auditoria do arquivo expurgado (design.md D10) — o FK também
        // tem ON DELETE CASCADE (migração 0008) como rede de segurança,
        // mas o passo explícito segue a ordem do design.
        await client.query('DELETE FROM audit_events WHERE file_id = $1', [file.id]);
        // 4. Grants órfãos.
        await client.query('DELETE FROM grants WHERE resource_type = $1 AND resource_id = $2', [
          GrantResourceType.FILE,
          file.id,
        ]);
        // 5. A linha por último.
        await client.query('DELETE FROM files WHERE id = $1', [file.id]);
      });

      summary.purgedFiles += 1;
    } catch (err) {
      summary.failedFiles += 1;
      console.error(`purge-trash: falha ao expurgar arquivo ${file.id}`, err);
    }
  }
}

async function purgeExpiredFolders(database: DatabasePort, summary: PurgeSummary): Promise<void> {
  // Repete até não sobrar folha vencida: uma pasta só pode ser apagada
  // quando não tem mais filho vivo (folhas primeiro, respeitando o FK
  // `parent_id`). Cada rodada apaga a camada de folhas exposta pela rodada
  // anterior.
  for (;;) {
    const leaves = await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
      const { rows } = await client.query<LeafFolderRow>(
        `SELECT f.id FROM folders f
         WHERE f.deleted_at IS NOT NULL AND f.deleted_at < now() - ($1 * interval '1 day')
           AND NOT EXISTS (SELECT 1 FROM folders c WHERE c.parent_id = f.id)`,
        [config.trashRetentionDays],
      );
      return rows;
    });

    if (leaves.length === 0) break;

    let anyPurged = false;
    for (const leaf of leaves) {
      try {
        await database.withTenantTransaction(SYSTEM_CTX, async (client) => {
          await client.query('DELETE FROM grants WHERE resource_type = $1 AND resource_id = $2', [
            GrantResourceType.FOLDER,
            leaf.id,
          ]);
          await client.query('DELETE FROM folders WHERE id = $1', [leaf.id]);
        });
        summary.purgedFolders += 1;
        anyPurged = true;
      } catch (err) {
        summary.failedFolders += 1;
        console.error(`purge-trash: falha ao expurgar pasta ${leaf.id}`, err);
      }
    }

    // Nenhuma folha foi removida nesta rodada (todas falharam) — pararia em
    // loop infinito reencontrando as mesmas folhas; encerra o ciclo, elas
    // reentram amanhã.
    if (!anyPurged) break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ports = createPorts();
  runPurge(ports)
    .then(async (summary) => {
      console.log(
        `Expurgo concluído: ${summary.purgedFiles} arquivo(s) apagado(s) (${summary.failedFiles} falha(s)), ` +
          `${summary.purgedFolders} pasta(s) apagada(s) (${summary.failedFolders} falha(s)).`,
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
