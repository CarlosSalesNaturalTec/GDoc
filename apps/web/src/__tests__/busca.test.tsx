import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@gdoc/shared';
import type { FileSummaryResponse, SearchFilesResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

const COLLABORATOR = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };
const ADMIN = { id: 'admin-1', unitId: 'unit-1', role: UserRole.UNIT_ADMIN };

function file(overrides: Partial<FileSummaryResponse> & { id: string; fileName: string }): FileSummaryResponse {
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

function results(files: FileSummaryResponse[]): SearchFilesResponse {
  return { files };
}

function fetchedUrls(): string[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
}

describe('Busca de arquivos (web-busca)', () => {
  it('busca com filtros combinados monta a query string certa e lista só o retornado (US 9.1 cenário 1)', async () => {
    const pdf = file({ id: 'file-pdf', fileName: 'relatorio.pdf' });

    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /files/search': { status: 200, body: results([pdf]) },
    });

    renderApp(['/busca']);
    await screen.findByText('relatorio.pdf');

    await userEvent.type(screen.getByPlaceholderText('Buscar por nome'), 'relatorio');
    await userEvent.click(screen.getByText('relatorio.pdf'));

    const searchCall = fetchedUrls().find((url) => url.includes('/files/search?q=relatorio'));
    expect(searchCall).toBeDefined();
  });

  it('limpar filtros reseta os controles e refaz a busca sem critérios (US 9.1 cenário 2)', async () => {
    const pdf = file({ id: 'file-pdf', fileName: 'relatorio.pdf' });

    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /files/search': { status: 200, body: results([pdf]) },
    });

    renderApp(['/busca']);
    await screen.findByText('relatorio.pdf');

    const searchInput = screen.getByPlaceholderText('Buscar por nome') as HTMLInputElement;
    await userEvent.type(searchInput, 'relatorio');
    expect(searchInput.value).toBe('relatorio');

    await userEvent.click(screen.getByRole('button', { name: /limpar filtros/i }));

    await waitFor(() => expect(searchInput.value).toBe(''));
    const emptySearchCall = fetchedUrls().find((url) => url.endsWith('/files/search'));
    expect(emptySearchCall).toBeDefined();
  });

  it('filtro de autor aparece para admin e envia author (spec: filtro de autor restrito a administrador)', async () => {
    const pdf = file({ id: 'file-pdf', fileName: 'relatorio.pdf' });

    mockFetch({
      'GET /auth/me': { status: 200, body: ADMIN },
      'GET /files/search': { status: 200, body: results([pdf]) },
      'GET /users': {
        status: 200,
        body: [{ id: 'author-1', unitId: 'unit-1', fullName: 'Fulano', email: 'fulano@example.com', phone: null, jobTitle: null, workArea: null, notes: null, role: UserRole.COLLABORATOR, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }],
      },
    });

    renderApp(['/busca']);
    await screen.findByText('relatorio.pdf');

    const authorSelect = screen.getByText('Autor').closest('.ant-select')!;
    await userEvent.click(within(authorSelect as HTMLElement).getByRole('combobox'));
    await screen.findByText('Fulano');
    await userEvent.click(screen.getByText('Fulano'));

    await waitFor(() => {
      const authorCall = fetchedUrls().find((url) => url.includes('author=author-1'));
      expect(authorCall).toBeDefined();
    });
  });

  it('filtro de autor não aparece para colaborador, sem chamar GET /users (spec: filtro de autor restrito a administrador)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /files/search': { status: 200, body: results([]) },
    });

    renderApp(['/busca']);
    await screen.findByText('Nenhum resultado');

    expect(screen.queryByText('Autor')).not.toBeInTheDocument();
    expect(fetchedUrls().some((url) => url.includes('/users'))).toBe(false);
  });

  it('resultado vazio exibe Empty; nome/"Visualizar" abre o PreviewModal e "Baixar" dispara a URL assinada', async () => {
    const image = file({ id: 'file-img', fileName: 'foto.png', contentType: 'image/png' });

    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /files/search': { status: 200, body: results([image]) },
      'POST /files/file-img/view-url': {
        status: 200,
        body: {
          previewAvailable: true,
          url: 'https://storage.example/foto.png?sig=abc',
          expiresAt: '2026-07-21T10:05:00.000Z',
          action: 'view',
        },
      },
    });

    renderApp(['/busca']);
    await screen.findByText('foto.png');

    const row = screen.getByText('foto.png').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /visualizar/i }));

    const dialog = await waitFor(() => screen.getByRole('dialog'));
    const img = await within(dialog).findByRole('img', { name: 'foto.png' });
    expect(img).toHaveAttribute('src', 'https://storage.example/foto.png?sig=abc');
  });

  it('busca sem resultados exibe estado vazio (spec: sem resultados exibe estado vazio)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /files/search': { status: 200, body: results([]) },
    });

    renderApp(['/busca']);
    await screen.findByText('Nenhum resultado');
  });
});
