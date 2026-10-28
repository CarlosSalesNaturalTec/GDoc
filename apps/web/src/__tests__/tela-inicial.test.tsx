import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentStatus, DocumentType, UserRole } from '@gdoc/shared';
import { mockFetch, ROTAS_DA_TELA_INICIAL } from './mock-fetch';
import { renderApp } from './render-app';
import { atalhosDoPapel } from '../inicio/atalhos';
import { mockViewportWidth, WIDE_VIEWPORT } from './viewport';
import { SEM_CONTROLE_DOCUMENTAL } from './document-control-fixture';

const COLABORADOR = {
  id: 'user-1',
  unitId: 'unit-1',
  role: UserRole.COLLABORATOR,
  fullName: 'Maria Silva',
  unitName: 'Unidade Centro',
};

function pasta(id: string, name: string) {
  return {
    id,
    unitId: 'unit-1',
    ownerId: 'user-1',
    parentId: null,
    name,
    createdAt: '2026-10-01T10:00:00.000Z',
  };
}

function documento(overrides: Record<string, unknown> = {}) {
  return {
    ...SEM_CONTROLE_DOCUMENTAL,
    id: 'file-1',
    ownerId: 'user-1',
    folderId: 'folder-1',
    folderName: 'Protocolos',
    fileName: 'documento.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    status: 'active',
    createdAt: '2026-10-20T10:00:00.000Z',
    changedAt: '2026-10-26T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Tela inicial (Épico 11, capability `tela-inicial`).
 *
 * A tela substitui um `Result` decorativo, e o que ela precisa provar não é
 * visual: que identifica a pessoa **pelo nome** e nunca pelo identificador
 * interno, que não oferece atalho que resultaria em recusa, e que as áreas de
 * pastas e de recentes orientam quando não têm o que mostrar, em vez de ficar
 * vazias sem explicação.
 */
describe('Tela inicial (US 11.1 e 11.2)', () => {
  it('apresenta nome, função e unidade de quem entrou (US 11.1, cenário 1)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);

    expect(await screen.findByText('Olá, Maria Silva!')).toBeInTheDocument();
    expect(screen.getByText('Colaborador · Unidade Centro')).toBeInTheDocument();
    // O identificador interno não aparece em lugar nenhum da tela.
    expect(document.body.textContent).not.toContain('user-1');
  });

  it('conta sem nome cadastrado recorre a tratamento genérico, nunca ao identificador (US 11.1, cenário 1)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: { ...COLABORADOR, fullName: '' } },
    });

    renderApp(['/']);

    expect(await screen.findByText('Olá!')).toBeInTheDocument();
    // Função e unidade continuam presentes — o que falta é só o nome.
    expect(screen.getByText('Colaborador · Unidade Centro')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('user-1');
    expect(document.body.textContent).not.toContain('US');
  });

  it('atalho fora do alcance do perfil não é apresentado (US 11.1, cenário 2)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);

    const atalhos = (await screen.findByText('O que você pode fazer')).closest(
      '.ant-card',
    ) as HTMLElement;
    expect(within(atalhos).getByRole('link', { name: 'Enviar documentos' })).toBeInTheDocument();
    expect(within(atalhos).getByRole('link', { name: 'Lixeira' })).toBeInTheDocument();
    // Administração não é alcance do colaborador: o atalho não existe, em vez
    // de existir e recusar ao ser acionado.
    expect(within(atalhos).queryByRole('link', { name: 'Colaboradores' })).not.toBeInTheDocument();
    expect(within(atalhos).queryByRole('link', { name: 'Painel' })).not.toBeInTheDocument();
    expect(within(atalhos).queryByRole('link', { name: 'Unidades' })).not.toBeInTheDocument();
  });

  it('o administrador global vê os atalhos de administração, incluindo unidades', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': {
        status: 200,
        body: { ...COLABORADOR, role: UserRole.GLOBAL_ADMIN, fullName: 'Ana Gestora' },
      },
    });

    renderApp(['/']);

    const atalhos = (await screen.findByText('O que você pode fazer')).closest(
      '.ant-card',
    ) as HTMLElement;
    expect(within(atalhos).getByRole('link', { name: 'Colaboradores' })).toBeInTheDocument();
    expect(within(atalhos).getByRole('link', { name: 'Painel' })).toBeInTheDocument();
    expect(within(atalhos).getByRole('link', { name: 'Unidades' })).toBeInTheDocument();
  });

  /**
   * "Atalho apresentado conduz a uma ação executável, sem recusa por
   * permissão" (US 11.1, cenário 2). A guarda de rota redireciona para `/`
   * quem chega fora do seu papel — então um atalho que recusasse apareceria
   * aqui como volta à própria tela inicial. É essa a prova: nenhum destino
   * oferecido devolve a pessoa ao ponto de partida.
   */
  it.each([
    [UserRole.COLLABORATOR, ['/pastas', '/lixeira']],
    [UserRole.UNIT_ADMIN, ['/pastas', '/lixeira', '/admin/pessoas', '/admin/painel']],
    [
      UserRole.GLOBAL_ADMIN,
      ['/pastas', '/lixeira', '/admin/pessoas', '/admin/painel', '/admin/unidades'],
    ],
  ])(
    'todo atalho oferecido a %s é alcançável, sem recusa por permissão',
    async (role, destinos) => {
      // Os destinos declarados no caso são exatamente os de `atalhosDoPapel` —
      // se um atalho novo entrar sem entrar aqui, a comparação abaixo acusa.
      expect([...new Set(atalhosDoPapel(role).map((a) => a.destino))].sort()).toEqual(
        [...destinos].sort(),
      );

      for (const destino of destinos) {
        mockViewportWidth(WIDE_VIEWPORT);
        mockFetch({
          ...ROTAS_DA_TELA_INICIAL,
          'GET /auth/me': { status: 200, body: { ...COLABORADOR, role } },
          'GET /trash': { status: 200, body: { items: [] } },
          'GET /users': { status: 200, body: [] },
          'GET /units': { status: 200, body: [] },
          'GET /dashboard': {
            status: 200,
            body: {
              totalFiles: 0,
              totalUsers: 0,
              usedBytes: 0,
              filesByCategory: [],
              uploadsByMonth: [],
              topUsers: [],
            },
          },
        });

        const tela = renderApp([destino]);
        // A guarda devolveria à tela inicial; chegar ao destino significa que
        // a ação está ao alcance do papel.
        await tela.findByRole('searchbox', { name: 'Buscar documentos' });
        expect(tela.queryByText('O que você pode fazer')).not.toBeInTheDocument();
        tela.unmount();
      }
    },
  );

  it('apresenta acesso rápido apenas às pastas que o servidor devolveu (US 11.1, cenário 3)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /folders/root/contents': {
        status: 200,
        body: {
          folder: null,
          breadcrumb: [],
          folders: [pasta('folder-1', 'Protocolos'), pasta('folder-2', 'Formulários')],
          files: [],
          canUpload: true,
        },
      },
    });

    renderApp(['/']);

    const cartoes = (await screen.findByText('Suas pastas')).closest('.ant-card') as HTMLElement;
    expect(await within(cartoes).findByRole('link', { name: 'Protocolos' })).toHaveAttribute(
      'href',
      '/pastas/folder-1',
    );
    expect(within(cartoes).getByRole('link', { name: 'Formulários' })).toBeInTheDocument();
    // A SPA nunca inventa pasta: o que não vem do servidor não existe aqui.
    expect(within(cartoes).queryByRole('link', { name: 'Reservada' })).not.toBeInTheDocument();
  });

  it('sem pastas acessíveis a área orienta, em vez de ficar vazia sem explicação', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);

    const cartoes = (await screen.findByText('Suas pastas')).closest('.ant-card') as HTMLElement;
    expect(
      await within(cartoes).findByText('Nenhuma pasta disponível para você no momento'),
    ).toBeInTheDocument();
  });

  it('lista os recentes na ordem do servidor, com a data de cada alteração (US 11.2, cenário 1)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /files/recent': {
        status: 200,
        body: {
          documents: [
            documento({
              id: 'file-recente',
              fileName: 'recente.pdf',
              changedAt: '2026-10-27T10:00:00.000Z',
              documentType: DocumentType.PROTOCOL,
              documentCode: 'PRT-001',
              documentStatus: DocumentStatus.CURRENT,
            }),
            documento({
              id: 'file-antigo',
              fileName: 'antigo.pdf',
              changedAt: '2026-10-01T10:00:00.000Z',
            }),
          ],
        },
      },
    });

    renderApp(['/']);

    const recentes = (await screen.findByText('Alterados recentemente')).closest(
      '.ant-card',
    ) as HTMLElement;
    await within(recentes).findByRole('table');
    const linhas = within(recentes).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.textContent).toContain('recente.pdf');
    expect(linhas[1]!.textContent).toContain('antigo.pdf');

    // Data da alteração, não a da publicação.
    expect(linhas[0]!.textContent).toContain('27/10/2026');
    expect(linhas[1]!.textContent).toContain('01/10/2026');

    // Tipo, código e situação vêm do servidor, como na listagem de pasta.
    expect(linhas[0]!.textContent).toContain('PRT');
    expect(linhas[0]!.textContent).toContain('PRT-001');
    expect(linhas[0]!.textContent).toContain('Vigente');
    // A pasta que contém o documento conduz ao explorador.
    expect(within(recentes).getAllByRole('link', { name: 'Protocolos' })[0]).toHaveAttribute(
      'href',
      '/pastas/folder-1',
    );
  });

  it('ausência de alterações é informada, em vez de tabela vazia sem explicação (US 11.2, cenário 4)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);

    const recentes = (await screen.findByText('Alterados recentemente')).closest(
      '.ant-card',
    ) as HTMLElement;
    expect(
      await within(recentes).findByText('Nenhuma alteração recente nos seus documentos'),
    ).toBeInTheDocument();
  });

  it('uma consulta lenta não bloqueia as demais áreas da tela (design.md, Risks)', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    // `/files/recent` nunca responde nesta montagem: as demais áreas precisam
    // aparecer de todo modo, porque as consultas são independentes.
    const nuncaResolve = new Promise<Response>(() => {});
    const fetchOriginal = globalThis.fetch;
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /folders/root/contents': {
        status: 200,
        body: {
          folder: null,
          breadcrumb: [],
          folders: [pasta('folder-1', 'Protocolos')],
          files: [],
          canUpload: true,
        },
      },
    });
    const comRecentesPendente = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (new URL(url, 'http://localhost').pathname === '/files/recent') return nuncaResolve;
      return comRecentesPendente(input, init);
    }) as typeof fetch;

    try {
      renderApp(['/']);

      // Saudação, atalhos e pastas resolvem mesmo com a lista de recentes
      // ainda pendurada.
      expect(await screen.findByText('Olá, Maria Silva!')).toBeInTheDocument();
      const cartoes = (await screen.findByText('Suas pastas')).closest('.ant-card') as HTMLElement;
      expect(await within(cartoes).findByRole('link', { name: 'Protocolos' })).toBeInTheDocument();
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('o destino "Recentes" da navegação apresenta a mesma lista', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /files/recent': {
        status: 200,
        body: { documents: [documento({ fileName: 'mudou.pdf' })] },
      },
    });

    renderApp(['/recentes']);

    expect(
      await screen.findByRole('heading', { name: 'Alterados recentemente' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'mudou.pdf' })).toBeInTheDocument();
  });
});
