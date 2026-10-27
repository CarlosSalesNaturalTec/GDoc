import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@gdoc/shared';
import type { FolderContentsResponse, StorageQuotaResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { mockXhr, mockControllableXhr } from './mock-xhr';
import { renderApp } from './render-app';

const IDENTITY = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };
const GIGA = 1024 * 1024 * 1024;

function contents(overrides: Partial<FolderContentsResponse> = {}): FolderContentsResponse {
  return { folder: null, breadcrumb: [], folders: [], files: [], canUpload: true, ...overrides };
}

function quota(overrides: Partial<StorageQuotaResponse> = {}): StorageQuotaResponse {
  return {
    quotaBytes: 10 * GIGA,
    usedBytes: 0,
    trashedBytes: 0,
    trashedFiles: 0,
    pendingBytes: 0,
    availableBytes: 10 * GIGA,
    ...overrides,
  };
}

function makeFile(name: string): File {
  return new File(['conteudo'], name, { type: 'application/pdf' });
}

function withRelativePath(f: File, path: string): File {
  Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
  return f;
}

/** `Upload multiple` é o 1º input; `Upload directory` é o 2º; a área de soltar, o 3º. */
function fileInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="file"]'));
}

function chamadas(caminho: string): unknown[][] {
  const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls.filter(
    ([input]) => new URL(String(input), 'http://x').pathname === caminho,
  );
}

function corpo(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string);
}

/** Mesmo padrão de `pessoas.test.tsx`: segue `aria-controls` até o dropdown certo. */
async function escolherNoCampo(
  escopo: HTMLElement,
  fieldLabel: string,
  optionLabel: string | RegExp,
): Promise<void> {
  const item = within(escopo).getByText(fieldLabel).closest('.ant-form-item') as HTMLElement;
  const combobox = within(item).getByRole('combobox');
  await userEvent.click(combobox);
  const dropdown = await waitFor(() => {
    const listboxId = combobox.getAttribute('aria-controls') ?? combobox.getAttribute('aria-owns');
    const container = listboxId
      ? document.getElementById(listboxId)?.closest('.ant-select-dropdown')
      : null;
    if (!container) throw new Error('dropdown do Select ainda não está no DOM');
    return container as HTMLElement;
  });
  await userEvent.click(await within(dropdown).findByText(optionLabel));
}

async function preencherControle(painel: HTMLElement, codigo: string): Promise<void> {
  await escolherNoCampo(painel, 'Tipo', /Protocolo/);
  await userEvent.type(within(painel).getByLabelText('Código'), codigo);
  await userEvent.type(within(painel).getByLabelText('Revisão'), '1');
  await userEvent.type(within(painel).getByLabelText('Próxima revisão'), '31/12/2030{enter}');
}

/**
 * Envio de **um** documento (Épico 10, capability `web-upload`): a exigência
 * dos dados de controle liga pela contagem da operação (design.md D7) — um
 * arquivo pede os quatro campos, vários ou uma pasta não pedem nada.
 */
describe('Envio de um documento pede os dados de controle (web-upload)', () => {
  it('seleção de um único arquivo apresenta o formulário e publica pela rota unitária (US 10.5 cenário 1)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
      'POST /files/upload-url': {
        status: 200,
        body: {
          uploadUrl: 'https://storage.example/doc',
          objectPath: 'doc',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    });
    mockXhr({ 'https://storage.example/doc': { status: 200 } });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [makeFile('protocolo.pdf')]);

    const painel = await screen.findByText('Dados do documento');
    const area = painel.closest('.ant-alert') as HTMLElement;

    // Nada é pedido ao servidor antes de a pessoa confirmar os dados.
    expect(chamadas('/files/upload-url')).toHaveLength(0);

    await preencherControle(area, 'PRT-NSP-001');
    await userEvent.click(within(area).getByRole('button', { name: /publicar documento/i }));

    await waitFor(() => expect(chamadas('/files/upload-url')).toHaveLength(1));
    const enviado = corpo(chamadas('/files/upload-url')[0]!);
    expect(enviado.fileName).toBe('protocolo.pdf');
    expect(enviado.documentControl).toMatchObject({
      documentType: 'protocol',
      documentCode: 'PRT-NSP-001',
      documentRevision: 1,
      nextReviewAt: '2030-12-31',
    });
    // O lote não é acionado: um documento não é um lote de um.
    expect(chamadas('/files/upload-urls')).toHaveLength(0);
    await screen.findByText('Envio concluído.');
  });

  it('o formulário exige os quatro campos antes de publicar', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
    });
    const xhr = mockControllableXhr();

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [makeFile('sem-dados.pdf')]);

    const painel = await screen.findByText('Dados do documento');
    const area = painel.closest('.ant-alert') as HTMLElement;
    await userEvent.click(within(area).getByRole('button', { name: /publicar documento/i }));

    await screen.findByText('Informe o código do documento');
    expect(chamadas('/files/upload-url')).toHaveLength(0);
    expect(xhr.started()).toBe(0);
  });

  it('vários arquivos não pedem dados de controle e seguem pelo lote (US 10.5 cenário 2)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [
            {
              fileName: 'a.pdf',
              ok: true,
              uploadUrl: 'https://storage.example/a',
              objectPath: 'a',
              folderId: null,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
            {
              fileName: 'b.pdf',
              ok: true,
              uploadUrl: 'https://storage.example/b',
              objectPath: 'b',
              folderId: null,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
          ],
        },
      },
    });
    mockXhr({
      'https://storage.example/a': { status: 200 },
      'https://storage.example/b': { status: 200 },
    });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [makeFile('a.pdf'), makeFile('b.pdf')]);

    await screen.findByText('Confirmar envio');
    expect(screen.queryByText('Dados do documento')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(chamadas('/files/upload-urls')).toHaveLength(1));
    expect(chamadas('/files/upload-url')).toHaveLength(0);
  });

  it('uma pasta com um único arquivo também não pede dados de controle (design.md D7)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
      'POST /files/upload-urls': {
        status: 200,
        body: {
          results: [
            {
              fileName: 'dentro.pdf',
              ok: true,
              uploadUrl: 'https://storage.example/dentro',
              objectPath: 'dentro',
              folderId: null,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
          ],
        },
      },
    });
    mockXhr({ 'https://storage.example/dentro': { status: 200 } });

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar pasta/i });

    // O envio de pasta é a outra entrada da plataforma: a operação é "uma
    // pasta", não "um arquivo", mesmo quando a pasta tem um só item.
    const [, folderInput] = fileInputs(container);
    await userEvent.upload(folderInput!, [
      withRelativePath(makeFile('dentro.pdf'), 'Procedimentos/dentro.pdf'),
    ]);

    await screen.findByText('Confirmar envio');
    expect(screen.queryByText('Dados do documento')).not.toBeInTheDocument();
  });

  it('código já em uso é apresentado como recusa específica, com o formulário preservado', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
      'POST /files/upload-url': {
        status: 409,
        body: { error: 'document_code_in_use', code: 'PRT-NSP-001' },
      },
    });
    const xhr = mockControllableXhr();

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [makeFile('duplicado.pdf')]);

    const painel = await screen.findByText('Dados do documento');
    const area = painel.closest('.ant-alert') as HTMLElement;
    await preencherControle(area, 'PRT-NSP-001');
    await userEvent.click(within(area).getByRole('button', { name: /publicar documento/i }));

    expect(
      await screen.findAllByText(
        'Código já em uso por outro documento desta unidade. Escolha outro código.',
      ),
    ).not.toHaveLength(0);
    // Nenhum byte foi transferido, e o formulário continua na tela com o que
    // a pessoa digitou — a recusa é acionável, não um beco sem saída.
    expect(xhr.started()).toBe(0);
    expect((within(area).getByLabelText('Código') as HTMLInputElement).value).toBe('PRT-NSP-001');
  });

  it('recusa por dado faltante vinda do servidor nomeia o que falta, sem virar "tente novamente"', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /folders/root/contents': { status: 200, body: contents() },
      'GET /files/quota': { status: 200, body: quota() },
      'POST /files/upload-url': {
        status: 400,
        body: { error: 'document_control_required', missing: ['documentRevision'] },
      },
    });
    mockControllableXhr();

    const { container } = renderApp(['/pastas']);
    await screen.findByRole('button', { name: /enviar arquivos/i });

    const [filesInput] = fileInputs(container);
    await userEvent.upload(filesInput!, [makeFile('faltando.pdf')]);

    const painel = await screen.findByText('Dados do documento');
    const area = painel.closest('.ant-alert') as HTMLElement;
    await preencherControle(area, 'PRT-NSP-002');
    await userEvent.click(within(area).getByRole('button', { name: /publicar documento/i }));

    expect(await screen.findAllByText('Faltam dados de controle: revisão.')).not.toHaveLength(0);
    expect(
      screen.queryByText('Não foi possível concluir a ação. Tente novamente.'),
    ).not.toBeInTheDocument();
  });
});
