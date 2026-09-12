import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UPLOAD_BATCH_MAX_ITEMS_DEFAULT } from '@gdoc/shared';
import type {
  BatchUploadItemResult,
  BatchUploadUrlResponse,
  FileSummaryResponse,
  FolderContentsResponse,
} from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { mockXhr, mockControllableXhr } from './mock-xhr';
import { renderApp } from './render-app';
import { mockViewportWidth, NARROW_VIEWPORT } from './viewport';

const IDENTITY = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };

function file(
  overrides: Partial<FileSummaryResponse> & { id: string; fileName: string },
): FileSummaryResponse {
  return {
    ownerId: 'user-1',
    folderId: null,
    contentType: 'application/pdf',
    sizeBytes: 2048,
    status: 'active',
    createdAt: '2026-07-02T10:00:00.000Z',
    ...overrides,
  };
}

function contents(overrides: Partial<FolderContentsResponse> = {}): FolderContentsResponse {
  return { folder: null, breadcrumb: [], folders: [], files: [], ...overrides };
}

function makeFile(name: string, content = 'conteudo'): File {
  return new File([content], name, { type: 'text/plain' });
}

function withRelativePath(f: File, path: string): File {
  Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
  return f;
}

/** `Upload multiple` é o 1º input do container; `Upload directory` é o 2º. */
function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="file"]'));
}

describe('Envio de arquivos e pastas (web-upload)', () => {
  it('lote de vários arquivos: uma chamada upload-urls, progresso e conclusão independentes (US 3.1 cenário 1)', async () => {
    const a = makeFile('a.txt');
    const b = makeFile('b.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [
            {
              fileName: 'a.txt',
              ok: true,
              uploadUrl: 'https://storage.example/a',
              objectPath: 'a',
              folderId: null,
              expiresAt: '2026-07-21T10:05:00.000Z',
            },
            {
              fileName: 'b.txt',
              ok: true,
              uploadUrl: 'https://storage.example/b',
              objectPath: 'b',
              folderId: null,
              expiresAt: '2026-07-21T10:05:00.000Z',
            },
          ],
        } satisfies BatchUploadUrlResponse,
      },
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockXhr({
      'https://storage.example/a': { status: 200 },
      'https://storage.example/b': { status: 200 },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a, b]);

    await screen.findByText('a.txt');
    await screen.findByText('b.txt');

    await waitFor(() =>
      expect(container.querySelectorAll('.ant-progress-status-success')).toHaveLength(2),
    );
    expect(screen.queryByRole('button', { name: /repetir/i })).not.toBeInTheDocument();

    const uploadUrlCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/files/upload-urls'),
    );
    expect(uploadUrlCalls).toHaveLength(1);
  });

  it('falha parcial por cota é sinalizada sem derrubar o lote; repetir reenvia só o item falho (US 3.1 cenário 2, RF #13)', async () => {
    const a = makeFile('a.txt');
    const b = makeFile('b.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': [
        {
          status: 200,
          body: {
            results: [
              {
                fileName: 'a.txt',
                ok: true,
                uploadUrl: 'https://storage.example/a',
                objectPath: 'a',
                folderId: null,
                expiresAt: '2026-07-21T10:05:00.000Z',
              },
              { fileName: 'b.txt', ok: false, error: 'quota exceeded' },
            ],
          } satisfies BatchUploadUrlResponse,
        },
        {
          status: 200,
          body: {
            results: [
              {
                fileName: 'b.txt',
                ok: true,
                uploadUrl: 'https://storage.example/b-retry',
                objectPath: 'b',
                folderId: null,
                expiresAt: '2026-07-21T10:05:00.000Z',
              },
            ],
          } satisfies BatchUploadUrlResponse,
        },
      ],
    });

    mockXhr({
      'https://storage.example/a': { status: 200 },
      'https://storage.example/b-retry': { status: 200 },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a, b]);

    await screen.findByText('Cota de armazenamento atingida.');
    await waitFor(() =>
      expect(container.querySelectorAll('.ant-progress-status-success')).toHaveLength(1),
    ); // a.txt concluiu

    const retryButton = await screen.findByRole('button', { name: /repetir/i });
    await userEvent.click(retryButton);

    await waitFor(() =>
      expect(container.querySelectorAll('.ant-progress-status-success')).toHaveLength(2),
    );
    expect(screen.queryByRole('button', { name: /repetir/i })).not.toBeInTheDocument();
  });

  it('envio de pasta deriva relativePath de webkitRelativePath, preservando a hierarquia (US 3.2)', async () => {
    const root = withRelativePath(makeFile('raiz.txt'), 'Pasta/raiz.txt');
    const nested = withRelativePath(makeFile('nested.txt'), 'Pasta/Sub/nested.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [
            {
              fileName: 'raiz.txt',
              ok: true,
              uploadUrl: 'https://storage.example/raiz',
              objectPath: 'raiz',
              folderId: null,
              expiresAt: '2026-07-21T10:05:00.000Z',
            },
            {
              fileName: 'nested.txt',
              ok: true,
              uploadUrl: 'https://storage.example/nested',
              objectPath: 'nested',
              folderId: 'folder-sub',
              expiresAt: '2026-07-21T10:05:00.000Z',
            },
          ],
        } satisfies BatchUploadUrlResponse,
      },
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockXhr({
      'https://storage.example/raiz': { status: 200 },
      'https://storage.example/nested': { status: 200 },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar pasta/i });

    const [, folderInput] = fileInputs(container);
    await userEvent.upload(folderInput!, [root, nested]);

    await screen.findByText('Pasta/raiz.txt');
    await screen.findByText('Pasta/Sub/nested.txt');

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/files/upload-urls'),
    )!;
    const body = JSON.parse(call[1].body as string);
    expect(body.items).toEqual([
      expect.objectContaining({ fileName: 'raiz.txt', relativePath: 'Pasta' }),
      expect.objectContaining({ fileName: 'nested.txt', relativePath: 'Pasta/Sub' }),
    ]);
  });

  it('sucesso do PUT invalida a listagem e o arquivo aparece pending, sem polling por active (design.md D6)', async () => {
    const uploaded = makeFile('novo.pdf');
    const pendingFile = file({ id: 'file-new', fileName: 'novo.pdf', status: 'pending' });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': [
        { status: 200, body: contents() },
        { status: 200, body: contents({ files: [pendingFile] }) },
      ],
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [
            {
              fileName: 'novo.pdf',
              ok: true,
              uploadUrl: 'https://storage.example/novo',
              objectPath: 'novo',
              folderId: null,
              expiresAt: '2026-07-21T10:05:00.000Z',
            },
          ],
        } satisfies BatchUploadUrlResponse,
      },
    });

    mockXhr({ 'https://storage.example/novo': { status: 200 } });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [uploaded]);

    await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());
    expect(screen.getAllByText('novo.pdf').length).toBeGreaterThanOrEqual(1);
  });

  it('destino sem permissão (403 no upload-urls) exibe aviso e não inicia transferência alguma (RF #10)', async () => {
    const a = makeFile('a.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': { status: 403, body: { error: 'forbidden' } },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a]);

    await screen.findByText('Permissão insuficiente para enviar arquivos neste destino.');
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
  });

  it('abaixo do limiar, enviar pasta é recusado no acionamento — botão continua visível (design.md D5, `web-responsividade`)', async () => {
    mockViewportWidth(NARROW_VIEWPORT);
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
    });

    renderApp(['/pastas']);
    const folderButton = await screen.findByRole('button', { name: /enviar pasta/i });

    await userEvent.click(folderButton);

    await screen.findByText(
      'Enviar pasta não está disponível neste dispositivo. Use um computador.',
    );
    // Distinguível da recusa por permissão insuficiente do mesmo fluxo.
    expect(
      screen.queryByText('Permissão insuficiente para enviar arquivos neste destino.'),
    ).not.toBeInTheDocument();
  });
});

/**
 * Defeitos consertados pelo change `corrige-defeitos-envio-lote`: fila de
 * concorrência (D4), renovação da URL vencida no retry (D5) e recusa
 * antecipada pelo teto de itens (D2).
 */
describe('Envio em lote — fila, vigência e teto (corrige-defeitos-envio-lote)', () => {
  const FUTURO = new Date(Date.now() + 3_600_000).toISOString();
  const PASSADO = new Date(Date.now() - 60_000).toISOString();

  function okResult(name: string, url: string, expiresAt = FUTURO): BatchUploadItemResult {
    return {
      fileName: name,
      ok: true,
      uploadUrl: url,
      objectPath: name,
      folderId: null,
      expiresAt,
    };
  }

  it('no máximo 4 PUTs simultâneos, e a fila drena por completo (design.md D4)', async () => {
    const total = 10;
    const files = Array.from({ length: total }, (_, i) => makeFile(`f${i}.txt`));

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: files.map((f, i) => okResult(f.name, `https://storage.example/f${i}`)),
        } satisfies BatchUploadUrlResponse,
      },
    });

    const xhr = mockControllableXhr();
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, files);

    // A fila abre exatamente 4 vagas, não as 10 aceitas.
    await waitFor(() => expect(xhr.inFlight()).toBe(4));
    expect(xhr.started()).toBe(4);

    // Itens sem vaga aparecem como aguardando, não como parados em 0%.
    await screen.findAllByText('Aguardando envio…');

    // Cada conclusão libera uma vaga, e só uma.
    let concluidos = 0;
    while (xhr.inFlight() > 0) {
      xhr.succeedOldest();
      concluidos += 1;
      await waitFor(() => expect(xhr.inFlight()).toBeLessThanOrEqual(4));
      if (concluidos < total) {
        await waitFor(() => expect(xhr.started()).toBe(Math.min(concluidos + 4, total)));
      }
    }

    // A fila drenou inteira: todos os 10 foram efetivamente transferidos.
    expect(concluidos).toBe(total);
    expect(xhr.started()).toBe(total);
    expect(new Set(xhr.startedUrls()).size).toBe(total);
  });

  it('item que falha libera a vaga imediatamente para o próximo (design.md D4)', async () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`g${i}.txt`));

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: files.map((f, i) => okResult(f.name, `https://storage.example/g${i}`)),
        } satisfies BatchUploadUrlResponse,
      },
    });

    const xhr = mockControllableXhr();
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, files);
    await waitFor(() => expect(xhr.inFlight()).toBe(4));

    xhr.failOldest();

    // A vaga liberada por FALHA é ocupada igual à liberada por sucesso.
    await waitFor(() => expect(xhr.started()).toBe(5));
    expect(xhr.inFlight()).toBe(4);
    await screen.findByText('Falha no envio.');
  });

  it('repetir com URL vencida pede URL nova em vez de reusar a vencida (design.md D5)', async () => {
    const a = makeFile('vencida.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': [
        {
          status: 200,
          body: {
            results: [okResult('vencida.txt', 'https://storage.example/velha', PASSADO)],
          } satisfies BatchUploadUrlResponse,
        },
        {
          status: 200,
          body: {
            results: [okResult('vencida.txt', 'https://storage.example/nova', FUTURO)],
          } satisfies BatchUploadUrlResponse,
        },
      ],
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const xhr = mockControllableXhr();
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a]);

    await waitFor(() => expect(xhr.inFlight()).toBe(1));
    xhr.failOldest();
    const repetir = await screen.findByRole('button', { name: /repetir/i });

    const chamadasAntes = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/files/upload-urls'),
    ).length;

    await userEvent.click(repetir);

    // Pediu URL nova...
    await waitFor(() => {
      const depois = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/files/upload-urls'),
      ).length;
      expect(depois).toBe(chamadasAntes + 1);
    });
    // ...e transferiu para ela, não para a vencida.
    await waitFor(() => expect(xhr.startedUrls()).toContain('https://storage.example/nova'));
  });

  it('repetir com URL vigente reusa a URL, sem requisição adicional (design.md D5)', async () => {
    const a = makeFile('vigente.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [okResult('vigente.txt', 'https://storage.example/mesma', FUTURO)],
        } satisfies BatchUploadUrlResponse,
      },
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const xhr = mockControllableXhr();
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a]);

    await waitFor(() => expect(xhr.inFlight()).toBe(1));
    xhr.failOldest();
    const repetir = await screen.findByRole('button', { name: /repetir/i });

    const chamadasAntes = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/files/upload-urls'),
    ).length;

    await userEvent.click(repetir);
    await waitFor(() => expect(xhr.started()).toBe(2));

    const depois = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/files/upload-urls'),
    ).length;
    expect(depois).toBe(chamadasAntes);
    expect(xhr.startedUrls()).toEqual([
      'https://storage.example/mesma',
      'https://storage.example/mesma',
    ]);
  });

  it('seleção acima do teto é recusada sem emitir requisição (design.md D2)', async () => {
    const demais = Array.from({ length: UPLOAD_BATCH_MAX_ITEMS_DEFAULT + 1 }, (_, i) =>
      makeFile(`x${i}.txt`),
    );

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, demais);

    await screen.findByText('Seleção acima do limite por envio');
    await screen.findByText(
      `Você selecionou ${demais.length} arquivos e o limite é ${UPLOAD_BATCH_MAX_ITEMS_DEFAULT} por envio. Envie em partes.`,
    );
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/files/upload-urls')),
    ).toHaveLength(0);
  });

  it('recusa por teto vinda do servidor não vira "tente novamente" (design.md D2)', async () => {
    const a = makeFile('h.txt');

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': {
        status: 400,
        body: { error: 'upload_batch_limit_exceeded', found: 300, allowed: 200 },
      },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a]);

    await screen.findByText('Seleção acima do limite por envio');
    await screen.findByText(
      'Você selecionou 300 arquivos e o limite é 200 por envio. Envie em partes.',
    );
    expect(
      screen.queryByText('Não foi possível solicitar o envio. Tente novamente.'),
    ).not.toBeInTheDocument();
  });
});

/**
 * Cenário "Segunda falha renova a URL mesmo se julgada vigente" da spec
 * `web-upload` (design.md D5): o relógio do navegador pode estar errado, e
 * por isso a vigência é otimização — poupar uma requisição —, nunca a
 * garantia de correção. Um `expiresAt` folgado que mesmo assim produz PUTs
 * falhos precisa levar a uma URL nova.
 */
describe('Renovação forçada após falhas consecutivas (design.md D5)', () => {
  it('segunda falha pede URL nova mesmo com expiresAt folgado', async () => {
    const FUTURO = new Date(Date.now() + 3_600_000).toISOString();
    const a = makeFile('teimosa.txt');

    const result = (url: string): BatchUploadItemResult => ({
      fileName: 'teimosa.txt',
      ok: true,
      uploadUrl: url,
      objectPath: 'teimosa.txt',
      folderId: null,
      expiresAt: FUTURO,
    });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'POST /files/upload-urls': [
        { status: 200, body: { results: [result('https://storage.example/velha')] } },
        { status: 200, body: { results: [result('https://storage.example/renovada')] } },
      ],
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const xhr = mockControllableXhr();
    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [a]);

    // 1ª falha.
    await waitFor(() => expect(xhr.inFlight()).toBe(1));
    xhr.failOldest();

    const contarPedidos = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/files/upload-urls')).length;
    const pedidosAposEnvio = contarPedidos();

    // 1º Repetir: URL julgada vigente, então reusa — sem pedir nada.
    await userEvent.click(await screen.findByRole('button', { name: /repetir/i }));
    await waitFor(() => expect(xhr.started()).toBe(2));
    expect(contarPedidos()).toBe(pedidosAposEnvio);
    expect(xhr.startedUrls()[1]).toBe('https://storage.example/velha');

    // 2ª falha — a URL "vigente" já falhou duas vezes.
    xhr.failOldest();

    // 2º Repetir: agora renova, apesar do expiresAt folgado.
    await userEvent.click(await screen.findByRole('button', { name: /repetir/i }));
    await waitFor(() => expect(contarPedidos()).toBe(pedidosAposEnvio + 1));
    await waitFor(() => expect(xhr.startedUrls()).toContain('https://storage.example/renovada'));
  });
});
