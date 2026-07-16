import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { PgDatabasePort } from '../adapters/pg-database-port.js';
import { EnvSecretsPort } from '../adapters/env-secrets-port.js';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import { InMemoryStoragePort } from './in-memory-storage-port.js';
import { setupTestDatabase, seedTwoUnits, withSystemBypass, sessionCookieFor } from './test-db.js';
import type { Ports } from '../ports/index.js';
import { config } from '../config.js';

interface FolderBody {
  id: string;
  parentId: string | null;
  name: string;
}

describe('Envio em lote e upload de pasta (US 3.1, US 3.2)', () => {
  let pool: Pool;
  let ports: Ports;
  let ids: Awaited<ReturnType<typeof seedTwoUnits>>;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    pool = setup.pool;
    ids = await seedTwoUnits(pool);

    const secrets = new EnvSecretsPort();
    ports = {
      database: new PgDatabasePort(),
      storage: new InMemoryStoragePort(),
      secrets,
      auth: new Argon2AuthPort(secrets),
    };
  });

  afterAll(async () => {
    await ports.database.close();
    await pool.end();
  });

  it('lote totalmente válido: cada item recebe URL própria e independente', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({
        items: [
          { fileName: 'um.txt', contentType: 'text/plain', declaredSizeBytes: 10 },
          { fileName: 'dois.txt', contentType: 'text/plain', declaredSizeBytes: 20 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0]).toMatchObject({ fileName: 'um.txt', ok: true });
    expect(res.body.results[1]).toMatchObject({ fileName: 'dois.txt', ok: true });
    expect(res.body.results[0].uploadUrl).toBeTruthy();
    expect(res.body.results[0].objectPath).not.toBe(res.body.results[1].objectPath);
  });

  it('falha parcial: item recusado por cota não impede os demais; reenvio isolado do item recusado funciona', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);
    const quota = config.storageQuotaBytesPerUser;

    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', cookie)
      .send({
        items: [
          { fileName: 'cabe.txt', contentType: 'text/plain', declaredSizeBytes: 100 },
          { fileName: 'estoura.bin', contentType: 'application/octet-stream', declaredSizeBytes: quota + 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ fileName: 'cabe.txt', ok: true });
    expect(res.body.results[1]).toMatchObject({ fileName: 'estoura.bin', ok: false, error: 'quota exceeded' });

    const rows = await withSystemBypass(pool, (client) =>
      client.query('SELECT file_name FROM files WHERE owner_id = $1', [ids.userA]),
    );
    const fileNames = rows.rows.map((r: { file_name: string }) => r.file_name);
    expect(fileNames).toContain('cabe.txt');
    expect(fileNames).not.toContain('estoura.bin');

    // Nova tentativa apenas do item que falhou, dentro da cota, conclui isolada.
    const retry = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', cookie)
      .send({ items: [{ fileName: 'estoura.bin', contentType: 'application/octet-stream', declaredSizeBytes: 50 }] });
    expect(retry.status).toBe(200);
    expect(retry.body.results[0]).toMatchObject({ fileName: 'estoura.bin', ok: true });
  });

  it('cota consciente do lote: itens que cabem individualmente mas estouram no conjunto são recusados', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userB);
    const quota = config.storageQuotaBytesPerUser;
    const each = Math.floor(quota / 2) + 1000; // dois itens, cada um cabe sozinho, juntos não

    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', cookie)
      .send({
        items: [
          { fileName: 'metade-1.bin', contentType: 'application/octet-stream', declaredSizeBytes: each },
          { fileName: 'metade-2.bin', contentType: 'application/octet-stream', declaredSizeBytes: each },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ fileName: 'metade-1.bin', ok: true });
    expect(res.body.results[1]).toMatchObject({ fileName: 'metade-2.bin', ok: false, error: 'quota exceeded' });

    const rows = await withSystemBypass(pool, (client) =>
      client.query('SELECT file_name FROM files WHERE owner_id = $1', [ids.userB]),
    );
    expect(rows.rows.map((r: { file_name: string }) => r.file_name)).toEqual(['metade-1.bin']);
  });

  it('estrutura de subpastas preservada: relativePath recria a hierarquia e vincula cada arquivo à pasta-folha', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);

    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', cookie)
      .send({
        items: [
          {
            fileName: 'a.pdf',
            contentType: 'application/pdf',
            declaredSizeBytes: 10,
            relativePath: 'Relatorios/2024',
          },
          {
            fileName: 'b.pdf',
            contentType: 'application/pdf',
            declaredSizeBytes: 10,
            relativePath: 'Relatorios/2025',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);

    const root = await request(app).get('/folders/root/contents').set('Cookie', cookie);
    const relatorios = root.body.folders.find((f: FolderBody) => f.name === 'Relatorios');
    expect(relatorios).toBeTruthy();

    const relatoriosContents = await request(app).get(`/folders/${relatorios.id}/contents`).set('Cookie', cookie);
    const subfolderNames = relatoriosContents.body.folders.map((f: FolderBody) => f.name).sort();
    expect(subfolderNames).toEqual(['2024', '2025']);

    const folder2024 = relatoriosContents.body.folders.find((f: FolderBody) => f.name === '2024');
    const contents2024 = await request(app).get(`/folders/${folder2024.id}/contents`).set('Cookie', cookie);
    expect(contents2024.body.files.map((f: { fileName: string }) => f.fileName)).toEqual(['a.pdf']);
  });

  it('reaproveitamento e idempotência: reenvio do mesmo lote não duplica pastas', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);

    const sendBatch = () =>
      request(app)
        .post('/files/upload-urls')
        .set('Cookie', cookie)
        .send({
          items: [
            { fileName: 'x.txt', contentType: 'text/plain', declaredSizeBytes: 5, relativePath: 'Idempotente/Sub' },
          ],
        });

    const first = await sendBatch();
    expect(first.status).toBe(200);
    const second = await sendBatch();
    expect(second.status).toBe(200);

    const dup = await withSystemBypass(pool, (client) =>
      client.query(
        `SELECT unit_id, parent_id, lower(name) FROM folders
         WHERE unit_id = $1 AND lower(name) IN ('idempotente', 'sub')
         GROUP BY unit_id, parent_id, lower(name) HAVING count(*) > 1`,
        [ids.unitA],
      ),
    );
    expect(dup.rows).toHaveLength(0);
  });

  it('árvore ancorada na pasta de destino informada', async () => {
    const app = createApp(ports);
    const cookie = await sessionCookieFor(ports, ids.userA);

    const destination = await request(app).post('/folders').set('Cookie', cookie).send({ name: 'Projeto' });
    const destinationId = (destination.body as FolderBody).id;

    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', cookie)
      .send({
        destinationFolderId: destinationId,
        items: [{ fileName: 'ancorado.txt', contentType: 'text/plain', declaredSizeBytes: 5, relativePath: 'Docs' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.results[0].ok).toBe(true);

    const projetoContents = await request(app).get(`/folders/${destinationId}/contents`).set('Cookie', cookie);
    const docsFolder = projetoContents.body.folders.find((f: FolderBody) => f.name === 'Docs');
    expect(docsFolder).toBeTruthy();
  });

  it('pasta de destino de outra unidade não é utilizável: nada é criado, sem vazar existência', async () => {
    const app = createApp(ports);
    const folderInB = await request(app)
      .post('/folders')
      .set('Cookie', await sessionCookieFor(ports, ids.userB))
      .send({ name: 'Pasta B Destino' });
    const folderBId = (folderInB.body as FolderBody).id;

    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({
        destinationFolderId: folderBId,
        items: [{ fileName: 'cross.txt', contentType: 'text/plain', declaredSizeBytes: 5 }],
      });

    expect(res.status).toBe(404);

    const created = await withSystemBypass(pool, (client) =>
      client.query('SELECT 1 FROM files WHERE file_name = $1', ['cross.txt']),
    );
    expect(created.rows).toHaveLength(0);
  });

  it('relativePath com path traversal é recusado por item, sem abortar o lote', async () => {
    const app = createApp(ports);
    const res = await request(app)
      .post('/files/upload-urls')
      .set('Cookie', await sessionCookieFor(ports, ids.userA))
      .send({
        items: [
          { fileName: 'ok.txt', contentType: 'text/plain', declaredSizeBytes: 5 },
          { fileName: 'malicioso.txt', contentType: 'text/plain', declaredSizeBytes: 5, relativePath: '../escape' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ fileName: 'ok.txt', ok: true });
    expect(res.body.results[1]).toMatchObject({ fileName: 'malicioso.txt', ok: false, error: 'invalid path' });
  });
});
