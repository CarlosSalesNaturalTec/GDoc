import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { UserRole } from '@gdoc/shared';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { traverseFolderSubtree } from '../lib/folder-tree.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass } from './test-db.js';
import type { TenantContext } from '../ports/database-port.js';

/**
 * Testa `traverseFolderSubtree` isolada da rota (task 2.4): hierarquia,
 * poda de subpasta sem `view`, caminhos relativos e exclusão de itens da
 * lixeira. A checagem de `view` sobre a própria pasta pedida é
 * responsabilidade do chamador (`routes/folders.ts`) — aqui só a
 * descendência é exercitada.
 */
describe('lib/folder-tree: travessia da subárvore para download de pasta', () => {
  let pool: Pool;
  let database: PgDatabasePort;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    database = setup.database;
    ids = await seedTwoUnits(pool);
  });

  afterAll(async () => {
    await database.close();
    await pool.end();
  });

  function ctxFor(userId: string, role: UserRole = UserRole.COLLABORATOR): TenantContext {
    return { unitId: ids.unitA, userId, role };
  }

  async function insertFolder(ownerId: string, name: string, parentId: string | null = null) {
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO folders (unit_id, owner_id, parent_id, name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [ids.unitA, ownerId, parentId, name],
      ),
    );
    return rows[0]!.id;
  }

  async function insertFile(
    ownerId: string,
    fileName: string,
    folderId: string | null,
    sizeBytes = 100,
    objectPath = `unitA/${fileName}`,
  ) {
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO files (unit_id, owner_id, folder_id, object_path, file_name, content_type, size_bytes, status)
         VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, 'active') RETURNING id`,
        [ids.unitA, ownerId, folderId, objectPath, fileName, sizeBytes],
      ),
    );
    return rows[0]!.id;
  }

  async function trashFolder(folderId: string) {
    await withSystemBypass(pool, (client) =>
      client.query(`UPDATE folders SET deleted_at = now(), trash_root_id = $1 WHERE id = $1`, [folderId]),
    );
  }

  async function trashFile(fileId: string) {
    await withSystemBypass(pool, (client) =>
      client.query(`UPDATE files SET deleted_at = now(), trash_root_id = $1 WHERE id = $1`, [fileId]),
    );
  }

  async function grant(userId: string, resourceType: 'file' | 'folder', resourceId: string, permission: string) {
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO grants (unit_id, subject_user_id, resource_type, resource_id, permission, granted_by)
         VALUES ($1, $2, $3, $4, $5, $2)`,
        [ids.unitA, userId, resourceType, resourceId, permission],
      ),
    );
  }

  it('reflete a hierarquia nos caminhos relativos, para o próprio dono', async () => {
    const ownerId = ids.userA;
    const root = await insertFolder(ownerId, 'Contratos');
    const sub = await insertFolder(ownerId, '2024', root);
    await insertFile(ownerId, 'raiz.txt', root);
    await insertFile(ownerId, 'aninhado.txt', sub);

    const result = await database.withTenantTransaction(ctxFor(ownerId), (client) =>
      traverseFolderSubtree(client, ctxFor(ownerId), root),
    );

    expect(result.totalFiles).toBe(2);
    const paths = result.entries.map((e) => e.relativePath).sort();
    expect(paths).toEqual(['2024/aninhado.txt', 'raiz.txt']);
  });

  it('recorte por permissão item a item: arquivo sem grant é contado mas não incluído', async () => {
    const ownerId = ids.userA;
    const root = await insertFolder(ownerId, 'Compartilhada');
    await insertFile(ownerId, 'meu.txt', root);
    const outroDono = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'outro-dono@test.dev', 'x', 'collaborator') RETURNING id`,
        [ids.unitA],
      ),
    );
    const outroDonoId = outroDono.rows[0]!.id;
    const deleFile = await insertFile(outroDonoId, 'dele.txt', root);

    await grant(ownerId, 'folder', root, 'view');

    const result = await database.withTenantTransaction(ctxFor(ownerId), (client) =>
      traverseFolderSubtree(client, ctxFor(ownerId), root),
    );

    expect(result.totalFiles).toBe(2);
    expect(result.entries.map((e) => e.fileName)).toEqual(['meu.txt']);

    await grant(ownerId, 'file', deleFile, 'download');
    const afterGrant = await database.withTenantTransaction(ctxFor(ownerId), (client) =>
      traverseFolderSubtree(client, ctxFor(ownerId), root),
    );
    expect(afterGrant.entries.map((e) => e.fileName).sort()).toEqual(['dele.txt', 'meu.txt']);
  });

  it('subpasta sem view é podada com sua descendência, e não conta em totalFiles', async () => {
    const ownerId = ids.userA;
    const requester = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'podado@test.dev', 'x', 'collaborator') RETURNING id`,
        [ids.unitA],
      ),
    );
    const requesterId = requester.rows[0]!.id;

    const root = await insertFolder(ownerId, 'Raiz Poda');
    const visibleSub = await insertFolder(ownerId, 'Visivel', root);
    const hiddenSub = await insertFolder(ownerId, 'Oculta', root);
    await insertFile(ownerId, 'visivel.txt', visibleSub);
    await insertFile(ownerId, 'oculto.txt', hiddenSub);

    await grant(requesterId, 'folder', root, 'view');
    await grant(requesterId, 'folder', visibleSub, 'view');
    await grant(requesterId, 'file', (await insertFile(ownerId, 'visivel2.txt', visibleSub)), 'download');

    const result = await database.withTenantTransaction(ctxFor(requesterId), (client) =>
      traverseFolderSubtree(client, ctxFor(requesterId), root),
    );

    // Só a subpasta visível é percorrida: 2 arquivos nela, 0 na oculta.
    expect(result.totalFiles).toBe(2);
    expect(result.entries.some((e) => e.relativePath.startsWith('Oculta/'))).toBe(false);
  });

  it('itens na lixeira nunca entram, mesmo sendo o próprio dono', async () => {
    const ownerId = ids.userA;
    const root = await insertFolder(ownerId, 'Com Lixeira');
    await insertFile(ownerId, 'ativo.txt', root);
    const trashedFile = await insertFile(ownerId, 'excluido.txt', root);
    await trashFile(trashedFile);

    const subTrashed = await insertFolder(ownerId, 'Subpasta Excluida', root);
    await insertFile(ownerId, 'dentro-da-subpasta-excluida.txt', subTrashed);
    await trashFolder(subTrashed);

    const result = await database.withTenantTransaction(ctxFor(ownerId), (client) =>
      traverseFolderSubtree(client, ctxFor(ownerId), root),
    );

    expect(result.totalFiles).toBe(1);
    expect(result.entries.map((e) => e.fileName)).toEqual(['ativo.txt']);
  });

  it('admin da unidade obtém a subárvore sem grant explícito', async () => {
    const root = await insertFolder(ids.userA, 'Pasta de Outro Dono', null);
    await insertFile(ids.userA, 'x.txt', root);

    const adminCtx = ctxFor(ids.globalAdmin, UserRole.GLOBAL_ADMIN);
    const result = await database.withTenantTransaction(adminCtx, (client) =>
      traverseFolderSubtree(client, adminCtx, root),
    );

    expect(result.totalFiles).toBe(1);
    expect(result.entries.map((e) => e.fileName)).toEqual(['x.txt']);
  });
});
