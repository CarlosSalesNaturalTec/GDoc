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
import { config } from '../config.js';

/**
 * `POST /folders/:id/download-manifest` e `/folders/root/download-manifest`
 * (US 3.3, `download-pasta-zip`). Cobre o recorte por permissão item a item,
 * a ausência de herança, a poda de subpastas sem `view`, a auditoria por
 * arquivo e os tetos configuráveis — ver design.md D2–D5, D8, D9.
 */
describe('Download de pasta: manifesto de URLs assinadas', () => {
  let pool: Pool;
  let ports: Ports;
  let storage: InMemoryStoragePort;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    storage = new InMemoryStoragePort();
    const secrets = new EnvSecretsPort();
    const database = new PgDatabasePort();
    ports = {
      database,
      notifications: new InAppNotificationPort(database),
      storage,
      secrets,
      auth: new Argon2AuthPort(secrets),
    };
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  async function insertFolder(unitId: string, ownerId: string, name: string, parentId: string | null = null) {
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO folders (unit_id, owner_id, parent_id, name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [unitId, ownerId, parentId, name],
      ),
    );
    return rows[0]!.id;
  }

  async function insertFile(
    unitId: string,
    ownerId: string,
    fileName: string,
    folderId: string | null,
    sizeBytes = 100,
  ) {
    const objectPath = `${unitId}/${ownerId}/${fileName}-${Math.random().toString(36).slice(2)}`;
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO files (unit_id, owner_id, folder_id, object_path, file_name, content_type, size_bytes, status)
         VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, 'active') RETURNING id`,
        [unitId, ownerId, folderId, objectPath, fileName, sizeBytes],
      ),
    );
    return { id: rows[0]!.id, objectPath };
  }

  async function insertUser(unitId: string, email: string) {
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ id: string }>(
        `INSERT INTO users (unit_id, email, password_hash, role) VALUES ($1, $2, 'x', 'collaborator') RETURNING id`,
        [unitId, email],
      ),
    );
    return rows[0]!.id;
  }

  async function grant(unitId: string, userId: string, resourceType: 'file' | 'folder', resourceId: string, permission: string) {
    await withSystemBypass(pool, (client) =>
      client.query(
        `INSERT INTO grants (unit_id, subject_user_id, resource_type, resource_id, permission, granted_by)
         VALUES ($1, $2, $3, $4, $5, $2)`,
        [unitId, userId, resourceType, resourceId, permission],
      ),
    );
  }

  async function auditActionsFor(fileId: string) {
    const { rows } = await withSystemBypass(pool, (client) =>
      client.query<{ action: string }>('SELECT action FROM audit_events WHERE file_id = $1', [fileId]),
    );
    return rows.map((r) => r.action);
  }

  it('5.1 hierarquia refletida nos caminhos relativos do manifesto', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);

    const root = await insertFolder(ids.unitA, ids.userA, 'Contratos-5.1');
    const sub = await insertFolder(ids.unitA, ids.userA, '2024', root);
    await insertFile(ids.unitA, ids.userA, 'raiz.txt', root);
    await insertFile(ids.unitA, ids.userA, 'aninhado.txt', sub);

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalFiles).toBe(2);
    expect(res.body.allowedFiles).toBe(2);
    const paths = (res.body.entries as { relativePath: string }[]).map((e) => e.relativePath).sort();
    expect(paths).toEqual(['2024/aninhado.txt', 'raiz.txt']);
  });

  it('5.2 recorte por permissão item a item: só os arquivos permitidos entram, sem falhar a operação', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);
    const outroDono = await insertUser(ids.unitA, 'outro-dono-5.2@test.dev');

    const root = await insertFolder(ids.unitA, ids.userA, 'Compartilhada-5.2');
    await insertFile(ids.unitA, ids.userA, 'meu.txt', root);
    await insertFile(ids.unitA, outroDono, 'dele.txt', root);

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalFiles).toBe(2);
    expect(res.body.allowedFiles).toBe(1);
    expect((res.body.entries as { fileName: string }[]).map((e) => e.fileName)).toEqual(['meu.txt']);
  });

  it('5.3 sem herança: grant apenas na pasta não libera os arquivos internos (allowedFiles === 0)', async () => {
    const app = createApp(ports);
    const outroDono = ids.userA;
    const requesterId = await insertUser(ids.unitA, 'sem-heranca-5.3@test.dev');
    const cookie = await sessionCookieFor(ports, requesterId);

    const root = await insertFolder(ids.unitA, outroDono, 'Pasta Sem Heranca 5.3');
    await insertFile(ids.unitA, outroDono, 'interno.txt', root);
    await grant(ids.unitA, requesterId, 'folder', root, 'view');

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalFiles).toBe(1);
    expect(res.body.allowedFiles).toBe(0);
    expect(res.body.entries).toEqual([]);
  });

  it('5.4 administrador da unidade obtém a subárvore da própria unidade sem grant explícito', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.globalAdmin);

    const root = await insertFolder(ids.unitA, ids.userA, 'Pasta Admin 5.4');
    await insertFile(ids.unitA, ids.userA, 'x.txt', root);

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.allowedFiles).toBe(1);
  });

  it('5.5 view ausente na pasta de entrada é negado com 403, sem vazar existência', async () => {
    const app = createApp(ports);
    const cookieA = await sessionCookieFor(ports, ids.userA);

    const folderInB = await insertFolder(ids.unitB, ids.userB, 'Pasta B 5.5');

    // Sem view: dono de outra unidade nem enxerga a pasta (RLS) — mesmo 403.
    const crossUnit = await request(app).post(`/folders/${folderInB}/download-manifest`).set('Cookie', cookieA);
    expect(crossUnit.status).toBe(403);

    // Mesma unidade, mas sem posse nem grant `view`.
    const noGrantUser = await insertUser(ids.unitA, 'sem-view-5.5@test.dev');
    const folderInA = await insertFolder(ids.unitA, ids.userA, 'Pasta A 5.5');
    const noGrantCookie = await sessionCookieFor(ports, noGrantUser);
    const denied = await request(app).post(`/folders/${folderInA}/download-manifest`).set('Cookie', noGrantCookie);
    expect(denied.status).toBe(403);
  });

  it('5.6 subpasta sem view é podada junto com sua descendência', async () => {
    const app = createApp(ports);
    const requesterId = await insertUser(ids.unitA, 'poda-5.6@test.dev');
    const cookie = await sessionCookieFor(ports, requesterId);

    const root = await insertFolder(ids.unitA, ids.userA, 'Raiz Poda 5.6');
    const visibleSub = await insertFolder(ids.unitA, ids.userA, 'Visivel', root);
    const hiddenSub = await insertFolder(ids.unitA, ids.userA, 'Oculta', root);
    const visibleFile = await insertFile(ids.unitA, ids.userA, 'visivel.txt', visibleSub);
    await insertFile(ids.unitA, ids.userA, 'oculto.txt', hiddenSub);

    await grant(ids.unitA, requesterId, 'folder', root, 'view');
    await grant(ids.unitA, requesterId, 'folder', visibleSub, 'view');
    await grant(ids.unitA, requesterId, 'file', visibleFile.id, 'download');

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalFiles).toBe(1);
    expect(res.body.allowedFiles).toBe(1);
    expect((res.body.entries as { relativePath: string }[])[0]!.relativePath).toBe('Visivel/visivel.txt');
  });

  it('5.7 auditoria: N arquivos incluídos geram N eventos download; arquivo omitido não gera evento', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);
    const outroDono = await insertUser(ids.unitA, 'omitido-5.7@test.dev');

    const root = await insertFolder(ids.unitA, ids.userA, 'Auditoria 5.7');
    const allowed1 = await insertFile(ids.unitA, ids.userA, 'a.txt', root);
    const allowed2 = await insertFile(ids.unitA, ids.userA, 'b.txt', root);
    const omitted = await insertFile(ids.unitA, outroDono, 'c.txt', root);

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.allowedFiles).toBe(2);

    expect(await auditActionsFor(allowed1.id)).toEqual(['download']);
    expect(await auditActionsFor(allowed2.id)).toEqual(['download']);
    expect(await auditActionsFor(omitted.id)).toEqual([]);
  });

  it('5.8a limite de contagem excedido: recusa acionável, zero URLs assinadas e zero eventos', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);
    const callsBefore = storage.calls.length;

    const root = await insertFolder(ids.unitA, ids.userA, 'Estoura Contagem 5.8a');
    const maxFiles = config.downloadManifest.maxFiles;
    const fileIds: string[] = [];
    for (let i = 0; i < maxFiles + 1; i++) {
      const created = await insertFile(ids.unitA, ids.userA, `f${i}.txt`, root, 10);
      fileIds.push(created.id);
    }

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      error: 'download_manifest_limit_exceeded',
      limit: 'maxFiles',
      found: maxFiles + 1,
      allowed: maxFiles,
    });
    expect(storage.calls).toHaveLength(callsBefore);

    for (const fileId of fileIds) {
      expect(await auditActionsFor(fileId)).toEqual([]);
    }
  }, 20000);

  it('5.8b limite de bytes excedido: recusa acionável, distinguível da recusa por contagem', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);
    const callsBefore = storage.calls.length;

    const root = await insertFolder(ids.unitA, ids.userA, 'Estoura Bytes 5.8b');
    const maxBytes = config.downloadManifest.maxBytes;
    const created = await insertFile(ids.unitA, ids.userA, 'grande.bin', root, maxBytes + 1);

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      error: 'download_manifest_limit_exceeded',
      limit: 'maxBytes',
      found: maxBytes + 1,
      allowed: maxBytes,
    });
    expect(storage.calls).toHaveLength(callsBefore);
    expect(await auditActionsFor(created.id)).toEqual([]);
  });

  it('5.9 itens na lixeira nunca entram, inclusive para o administrador da unidade', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.globalAdmin);

    const root = await insertFolder(ids.unitA, ids.userA, 'Com Lixeira 5.9');
    await insertFile(ids.unitA, ids.userA, 'ativo.txt', root);
    const trashed = await insertFile(ids.unitA, ids.userA, 'excluido.txt', root);
    await withSystemBypass(pool, (client) =>
      client.query(`UPDATE files SET deleted_at = now(), trash_root_id = $1 WHERE id = $1`, [trashed.id]),
    );

    const res = await request(app).post(`/folders/${root}/download-manifest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalFiles).toBe(1);
    expect((res.body.entries as { fileName: string }[]).map((e) => e.fileName)).toEqual(['ativo.txt']);
  });

  it('5.10a pasta de outra unidade é negada sem revelar existência', async () => {
    const app = createApp(ports);
    const cookieA = await sessionCookieFor(ports, ids.userA);
    const folderInB = await insertFolder(ids.unitB, ids.userB, 'Pasta B Isolada 5.10');

    const res = await request(app).post(`/folders/${folderInB}/download-manifest`).set('Cookie', cookieA);
    expect(res.status).toBe(403);
  });

  it('5.10b global_admin não obtém conteúdo de unidade diferente da do seu contexto', async () => {
    const app = createApp(ports);
    const cookieAdmin = await sessionCookieFor(ports, ids.globalAdmin); // contexto = unitA
    const folderInB = await insertFolder(ids.unitB, ids.userB, 'Pasta B Admin 5.10');
    await insertFile(ids.unitB, ids.userB, 'y.txt', folderInB);

    const res = await request(app).post(`/folders/${folderInB}/download-manifest`).set('Cookie', cookieAdmin);
    expect(res.status).toBe(403);
  });

  it('raiz da unidade: manifesto funciona sem checagem de view sobre um recurso próprio', async () => {
    const app = createApp(ports);
    const requesterId = await insertUser(ids.unitA, 'raiz-6.1@test.dev');
    const cookie = await sessionCookieFor(ports, requesterId);

    await insertFile(ids.unitA, requesterId, 'na-raiz.txt', null);

    const res = await request(app).post('/folders/root/download-manifest').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.allowedFiles).toBeGreaterThanOrEqual(1);
  });
});
