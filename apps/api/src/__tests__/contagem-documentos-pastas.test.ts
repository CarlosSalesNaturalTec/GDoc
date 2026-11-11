import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { InAppNotificationPort } from '../adapters/in-app-notification-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';

/**
 * Contagem de documentos por subpasta na resposta de conteúdo (change
 * `contagem-de-documentos-nas-pastas`, design.md D1/D2/D4; US 11.1, cenário 3;
 * `docs/demanda_cliente_3.md`, item 7).
 *
 * É teste de **não vazamento**, irmão de `isolamento-unidade.test.ts` e
 * `expiracao-permissoes-acesso.test.ts`: o número não pode dizer mais do que a
 * pessoa veria ao abrir a pasta. A propriedade central é a igualdade
 * `documentCount(X) === GET /folders/X/contents → files.length`, afirmada
 * para cada perfil.
 */

interface ListedFolder {
  id: string;
  name: string;
  documentCount?: number;
}

const PAST = '2000-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';

describe('Contagem de documentos nas pastas, filtrada pelo acesso', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;
  let adminA: string;
  let viewer: string;
  let uploader: string;

  let pastaGeral: string;
  let pastaSoSubpastas: string;
  let pastaSubpasta: string;
  let pastaOutraUnidade: string;
  let arquivoComView: string;
  let arquivoExpirado: string;
  let arquivoNaLixeira: string;
  let arquivoObsoleto: string;
  let arquivoPendente: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const { rows: users } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES
           ($1, 'admin-a-contagem@test.dev', 'x', 'unit_admin'),
           ($1, 'viewer-contagem@test.dev', 'x', 'collaborator'),
           ($1, 'uploader-contagem@test.dev', 'x', 'collaborator')
         RETURNING id`,
        [ids.unitA],
      ),
    );
    adminA = users[0]!.id;
    viewer = users[1]!.id;
    uploader = users[2]!.id;

    async function makeFolder(
      unitId: string,
      ownerId: string,
      name: string,
      parentId: string | null = null,
    ): Promise<string> {
      const { rows } = await withSystemBypass(pool, (client) =>
        client.query<{ id: string }>(
          `INSERT INTO folders (unit_id, owner_id, parent_id, name) VALUES ($1, $2, $3, $4) RETURNING id`,
          [unitId, ownerId, parentId, name],
        ),
      );
      return rows[0]!.id;
    }

    async function makeFile(
      unitId: string,
      ownerId: string,
      folderId: string,
      name: string,
      extra: { deleted?: boolean; obsolete?: boolean; awaiting?: boolean } = {},
    ): Promise<string> {
      const { rows } = await withSystemBypass(pool, (client) =>
        client.query<{ id: string }>(
          `INSERT INTO files (unit_id, owner_id, folder_id, object_path, file_name, status,
             deleted_at, lifecycle_state, awaiting_registration)
           VALUES ($1, $2, $3, $4, $5, 'active',
             CASE WHEN $6 THEN now() ELSE NULL END,
             CASE WHEN $7 THEN 'obsolete' ELSE NULL END,
             $8)
           RETURNING id`,
          [
            unitId,
            ownerId,
            folderId,
            `${unitId}/${ownerId}/${name}`,
            name,
            extra.deleted ?? false,
            extra.obsolete ?? false,
            extra.awaiting ?? false,
          ],
        ),
      );
      return rows[0]!.id;
    }

    async function grant(
      subject: string,
      type: 'folder' | 'file',
      resourceId: string,
      expiresAt: string,
    ): Promise<void> {
      await withSystemBypass(pool, (client) =>
        client.query(
          `INSERT INTO grants (unit_id, subject_user_id, resource_type, resource_id, permission, granted_by, expires_at)
           VALUES ($1, $2, $3, $4, 'view', $5, $6)`,
          [ids.unitA, subject, type, resourceId, adminA, expiresAt],
        ),
      );
    }

    // "Geral" (dono: userA) com: 2 comuns (um com `view` vigente para o
    // viewer, um com `view` expirada), 1 na lixeira, 1 obsoleto e 1 pendente
    // de cadastro enviado pelo uploader.
    pastaGeral = await makeFolder(ids.unitA, ids.userA, 'Geral');
    arquivoComView = await makeFile(ids.unitA, ids.userA, pastaGeral, 'com-view.pdf');
    arquivoExpirado = await makeFile(ids.unitA, ids.userA, pastaGeral, 'expirado.pdf');
    arquivoNaLixeira = await makeFile(ids.unitA, ids.userA, pastaGeral, 'lixeira.pdf', {
      deleted: true,
    });
    arquivoObsoleto = await makeFile(ids.unitA, ids.userA, pastaGeral, 'obsoleto.pdf', {
      obsolete: true,
    });
    arquivoPendente = await makeFile(ids.unitA, uploader, pastaGeral, 'pendente.pdf', {
      awaiting: true,
    });

    // "Setores": só subpastas, com documentos dentro.
    pastaSoSubpastas = await makeFolder(ids.unitA, ids.userA, 'Setores');
    pastaSubpasta = await makeFolder(ids.unitA, ids.userA, 'Qualidade', pastaSoSubpastas);
    await makeFile(ids.unitA, ids.userA, pastaSubpasta, 'na-subpasta.pdf');

    // Pasta e arquivos da outra unidade.
    pastaOutraUnidade = await makeFolder(ids.unitB, ids.userB, 'Geral B');
    await makeFile(ids.unitB, ids.userB, pastaOutraUnidade, 'b1.pdf');
    await makeFile(ids.unitB, ids.userB, pastaOutraUnidade, 'b2.pdf');

    // Viewer: `view` na pasta Geral e em Setores (sem herança), `view` vigente
    // em um arquivo, expirada em outro, e vigente nos itens que os cortes
    // restritivos (lixeira, obsoleto, pendente) devem esconder mesmo assim.
    await grant(viewer, 'folder', pastaGeral, FUTURE);
    await grant(viewer, 'folder', pastaSoSubpastas, FUTURE);
    await grant(viewer, 'file', arquivoComView, FUTURE);
    await grant(viewer, 'file', arquivoExpirado, PAST);
    await grant(viewer, 'file', arquivoNaLixeira, FUTURE);
    await grant(viewer, 'file', arquivoObsoleto, FUTURE);
    await grant(viewer, 'file', arquivoPendente, FUTURE);
    // Uploader: `view` só na pasta (o pendente é dele).
    await grant(uploader, 'folder', pastaGeral, FUTURE);

    const secrets = new EnvSecretsPort();
    const database = new PgDatabasePort();
    ports = {
      database,
      notifications: new InAppNotificationPort(database),
      storage: new InMemoryStoragePort(),
      secrets,
      auth: new Argon2AuthPort(secrets),
    };
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  async function root(userId: string): Promise<ListedFolder[]> {
    const res = await request(createApp(ports))
      .get('/folders/root/contents')
      .set('Cookie', await sessionCookieFor(ports, userId));
    expect(res.status).toBe(200);
    return res.body.folders as ListedFolder[];
  }

  async function filesIn(userId: string, folderId: string): Promise<number> {
    const res = await request(createApp(ports))
      .get(`/folders/${folderId}/contents`)
      .set('Cookie', await sessionCookieFor(ports, userId));
    expect(res.status).toBe(200);
    return (res.body.files as unknown[]).length;
  }

  function countOf(folders: ListedFolder[], id: string): number | undefined {
    return folders.find((f) => f.id === id)?.documentCount;
  }

  it('dono: conta comuns, obsoleto fora, pendente de terceiro fora, lixeira fora', async () => {
    const folders = await root(ids.userA);
    // com-view + expirado (do dono). Obsoleto sai até para o dono; o pendente
    // é do uploader; a lixeira nunca conta.
    expect(countOf(folders, pastaGeral)).toBe(2);
    expect(countOf(folders, pastaGeral)).toBe(await filesIn(ids.userA, pastaGeral));
  });

  it('admin da unidade: conta todos os vivos, inclusive obsoleto e pendente, nunca a lixeira', async () => {
    const folders = await root(adminA);
    expect(countOf(folders, pastaGeral)).toBe(4);
    expect(countOf(folders, pastaGeral)).toBe(await filesIn(adminA, pastaGeral));
  });

  it('colaborador com concessões parciais: só o que pode visualizar, sem herança da pasta', async () => {
    const folders = await root(viewer);
    // Só `com-view.pdf`: a concessão sobre a pasta não libera o resto, a do
    // expirado venceu (relógio do banco, sem job), e lixeira, obsoleto e
    // pendente de terceiro saem mesmo com `view` vigente.
    expect(countOf(folders, pastaGeral)).toBe(1);
    expect(countOf(folders, pastaGeral)).toBe(await filesIn(viewer, pastaGeral));
  });

  it('quem enviou o pendente de cadastro o vê contado', async () => {
    const folders = await root(uploader);
    expect(countOf(folders, pastaGeral)).toBe(1);
    expect(countOf(folders, pastaGeral)).toBe(await filesIn(uploader, pastaGeral));
  });

  it('pasta só com subpastas tem contagem zero (só filhos diretos)', async () => {
    for (const user of [ids.userA, adminA, viewer]) {
      const folders = await root(user);
      expect(countOf(folders, pastaSoSubpastas)).toBe(0);
    }
    // E a contagem também vem nas subpastas de `/folders/:id/contents`.
    const res = await request(createApp(ports))
      .get(`/folders/${pastaSoSubpastas}/contents`)
      .set('Cookie', await sessionCookieFor(ports, ids.userA));
    const sub = (res.body.folders as ListedFolder[]).find((f) => f.id === pastaSubpasta);
    expect(sub?.documentCount).toBe(1);
  });

  it('pasta sem acesso não aparece nem é contada', async () => {
    // Colaborador da mesma unidade sem concessão nenhuma.
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, 'sem-acesso-contagem@test.dev', 'x', 'collaborator') RETURNING id`,
        [ids.unitA],
      ),
    );
    const folders = await root(rows[0]!.id);
    expect(folders).toEqual([]);
  });

  it('admin global conta só a própria unidade e não vê pasta de outra', async () => {
    const folders = await root(ids.globalAdmin);
    expect(folders.map((f) => f.id)).not.toContain(pastaOutraUnidade);
    expect(countOf(folders, pastaGeral)).toBe(4);
    expect(countOf(folders, pastaGeral)).toBe(await filesIn(ids.globalAdmin, pastaGeral));
  });

  it('a outra unidade conta só o que é dela', async () => {
    const folders = await root(ids.userB);
    expect(folders.map((f) => f.id)).toEqual([pastaOutraUnidade]);
    expect(countOf(folders, pastaOutraUnidade)).toBe(2);
  });
});
