import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole, GrantResourceType } from '@gdoc/shared';
import type { FileSummaryResponse, TrashEntryResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

const IDENTITY = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };

const DAY_MS = 24 * 60 * 60 * 1000;

/** `expiresAt` relativo a agora, em dias — evita depender de hora real do sistema no teste. */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function trashEntry(overrides: Partial<TrashEntryResponse> & { id: string; name: string }): TrashEntryResponse {
  return {
    type: GrantResourceType.FILE,
    deletedAt: '2026-07-10T10:00:00.000Z',
    expiresAt: inDays(15),
    ...overrides,
  };
}

function fileRestoreResponse(
  overrides: Partial<FileSummaryResponse> & { id: string; fileName: string; redirectedToRoot: boolean },
) {
  return {
    ownerId: 'user-1',
    folderId: null,
    contentType: 'application/pdf',
    sizeBytes: 2048,
    status: 'active',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('Lixeira da SPA (web-lixeira)', () => {
  it('lista os itens de GET /trash com a Tag de dias restantes correta, inclusive vermelho em ≤3 dias (US 6.1 cenário 1)', async () => {
    const urgente = trashEntry({
      id: 'file-urgente',
      name: 'urgente.pdf',
      expiresAt: inDays(2),
    });
    const tranquilo = trashEntry({
      id: 'file-tranquilo',
      name: 'tranquilo.pdf',
      type: GrantResourceType.FOLDER,
      expiresAt: inDays(25),
    });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': { status: 200, body: { items: [urgente, tranquilo] } },
    });

    renderApp(['/lixeira']);

    await screen.findByText('urgente.pdf');
    await screen.findByText('tranquilo.pdf');

    const urgenteRow = screen.getByText('urgente.pdf').closest('tr')!;
    const urgenteTag = within(urgenteRow).getByText('2 dia(s)');
    expect(urgenteTag.closest('.ant-tag')).toHaveClass('ant-tag-red');

    const tranquiloRow = screen.getByText('tranquilo.pdf').closest('tr')!;
    const tranquiloTag = within(tranquiloRow).getByText('25 dia(s)');
    expect(tranquiloTag.closest('.ant-tag')).not.toHaveClass('ant-tag-red');
    expect(tranquiloTag.closest('.ant-tag')).not.toHaveClass('ant-tag-orange');
  });

  it('lixeira vazia exibe Empty (spec: lixeira vazia)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': { status: 200, body: { items: [] } },
    });

    renderApp(['/lixeira']);

    await screen.findByText('A lixeira está vazia');
  });

  it('restaurar um arquivo despacha para POST /files/:id/restore, exibe "local de origem" e some da lista (US 6.1 cenário 1)', async () => {
    const entry = trashEntry({ id: 'file-1', name: 'relatorio.pdf', type: GrantResourceType.FILE });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': [{ status: 200, body: { items: [entry] } }, { status: 200, body: { items: [] } }],
      'POST /files/file-1/restore': {
        status: 200,
        body: fileRestoreResponse({ id: 'file-1', fileName: 'relatorio.pdf', redirectedToRoot: false }),
      },
    });

    renderApp(['/lixeira']);
    await screen.findByText('relatorio.pdf');

    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sim, restaurar' }));

    await screen.findByText('Arquivo restaurado ao local de origem.');
    await waitFor(() => expect(screen.queryByText('relatorio.pdf')).not.toBeInTheDocument());
  });

  it('restaurar uma pasta despacha para POST /folders/:id/restore e sempre exibe "local de origem" (US 6.1 cenário 1)', async () => {
    const entry = trashEntry({ id: 'folder-1', name: 'Pasta A', type: GrantResourceType.FOLDER });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': [{ status: 200, body: { items: [entry] } }, { status: 200, body: { items: [] } }],
      'POST /folders/folder-1/restore': {
        status: 200,
        body: { id: 'folder-1', unitId: 'unit-1', ownerId: 'user-1', parentId: null, name: 'Pasta A', createdAt: '2026-07-01T10:00:00.000Z' },
      },
    });

    renderApp(['/lixeira']);
    await screen.findByText('Pasta A');

    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sim, restaurar' }));

    await screen.findByText('Pasta restaurada ao local de origem.');
    await waitFor(() => expect(screen.queryByText('Pasta A')).not.toBeInTheDocument());
  });

  it('redirectedToRoot: true exibe a mensagem distinta de raiz da unidade (spec: aviso quando o arquivo volta à raiz)', async () => {
    const entry = trashEntry({ id: 'file-2', name: 'orfao.pdf', type: GrantResourceType.FILE });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': [{ status: 200, body: { items: [entry] } }, { status: 200, body: { items: [] } }],
      'POST /files/file-2/restore': {
        status: 200,
        body: fileRestoreResponse({ id: 'file-2', fileName: 'orfao.pdf', redirectedToRoot: true }),
      },
    });

    renderApp(['/lixeira']);
    await screen.findByText('orfao.pdf');

    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sim, restaurar' }));

    await screen.findByText(
      'A pasta de origem não existe mais; o arquivo foi restaurado na raiz da unidade.',
    );
  });

  it('403 na restauração exibe aviso de permissão insuficiente e recarrega a lista (spec: 403 na restauração)', async () => {
    const entry = trashEntry({ id: 'file-3', name: 'protegido.pdf', type: GrantResourceType.FILE });

    mockFetch({
      'GET /auth/me': { status: 200, body: IDENTITY },
      'GET /trash': [{ status: 200, body: { items: [entry] } }, { status: 200, body: { items: [] } }],
      'POST /files/file-3/restore': { status: 403, body: { error: 'forbidden' } },
    });

    renderApp(['/lixeira']);
    await screen.findByText('protegido.pdf');

    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sim, restaurar' }));

    await screen.findByText('Permissão insuficiente para restaurar este item.');
    await waitFor(() => expect(screen.queryByText('protegido.pdf')).not.toBeInTheDocument());
  });
});
