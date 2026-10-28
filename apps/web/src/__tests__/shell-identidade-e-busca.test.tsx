import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch, ROTAS_DA_TELA_INICIAL } from './mock-fetch';
import { renderApp } from './render-app';
import { mockViewportWidth, NARROW_VIEWPORT, WIDE_VIEWPORT } from './viewport';

const IDENTIFICADOR = '66e1b0f2-0000-4000-8000-000000000001';

const COLABORADOR = {
  id: IDENTIFICADOR,
  unitId: 'unit-1',
  role: UserRole.COLLABORATOR,
  fullName: 'Maria Silva',
  unitName: 'Unidade Centro',
};

function destinos(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ant-menu-item')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

/**
 * Identidade real no shell e busca no cabeçalho (capability
 * `web-shell-e-auth` e `web-busca`, change `shell-e-inicio`).
 *
 * Os dois requisitos corrigem o mesmo defeito de origem: o shell apresentava
 * `identity.id.slice(0, 2)` como identidade da pessoa — rótulos como "66 /
 * Colaborador" — e a busca ocupava um destino da navegação em vez de estar ao
 * alcance de toda tela. Os testes travam a proibição do identificador em
 * **qualquer** lugar do shell e o acionamento explícito da busca, que esta
 * change não afrouxa.
 */
describe('Identidade do shell é o nome da pessoa (web-shell-e-auth)', () => {
  it('apresenta o nome e as iniciais, sem o identificador interno em lugar nenhum do shell', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);
    await screen.findByText('O que você pode fazer');

    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    expect(within(cabecalho).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(cabecalho).getByText('MS')).toBeInTheDocument();

    // Nem o identificador inteiro, nem o fragmento que era exibido antes.
    expect(document.body.textContent).not.toContain(IDENTIFICADOR);
    expect(within(cabecalho).queryByText('66')).not.toBeInTheDocument();
  });

  it('conta sem nome recorre a tratamento genérico, nunca ao identificador', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: { ...COLABORADOR, fullName: '' } },
    });

    renderApp(['/']);
    await screen.findByText('O que você pode fazer');

    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    // O papel é o tratamento genérico: informação que a pessoa reconhece como
    // sua, ao contrário de um fragmento de uuid.
    expect(within(cabecalho).getByText('Colaborador')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(IDENTIFICADOR);
    expect(within(cabecalho).queryByText('66')).not.toBeInTheDocument();
  });

  it('o menu de identidade continua dando acesso a Minha conta e a Sair', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);
    await screen.findByText('O que você pode fazer');

    await userEvent.click(screen.getByText('Maria Silva'));
    expect(await screen.findByRole('link', { name: 'Minha conta' })).toBeInTheDocument();
    expect(await screen.findByText('Sair')).toBeInTheDocument();
  });
});

describe('Busca fora da navegação e permanente no cabeçalho (web-busca)', () => {
  it('a busca não ocupa destino da navegação, nos dois modos de apresentação', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    const largo = renderApp(['/']);
    await largo.findByText('O que você pode fazer');
    const doModoLargo = destinos(largo.container.querySelector('.ant-layout-sider')!);
    expect(doModoLargo).not.toContain('Buscar');
    expect(doModoLargo).toEqual(['Início', 'Documentos', 'Recentes', 'Lixeira']);
    largo.unmount();

    mockViewportWidth(NARROW_VIEWPORT);
    const estreito = renderApp(['/']);
    await userEvent.click(await estreito.findByRole('button', { name: 'Abrir navegação' }));
    await screen.findByRole('link', { name: 'Documentos' });
    const doPainel = destinos(document.querySelector('.ant-drawer-content') as HTMLElement);
    expect(doPainel).toEqual(doModoLargo);
  });

  it('o campo do cabeçalho está presente em qualquer tela autenticada', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /trash': { status: 200, body: { items: [] } },
    });

    renderApp(['/lixeira']);

    // A sessão resolve antes do shell montar: esperar o campo pela árvore
    // inteira e só então afirmar que ele está no cabeçalho.
    const campo = await screen.findByRole('searchbox', { name: 'Buscar documentos' });
    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    expect(cabecalho).toContainElement(campo);
  });

  it('digitar no campo não dispara consulta ao servidor — o acionamento permanece explícito', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);
    await screen.findByText('O que você pode fazer');

    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    const campo = within(cabecalho).getByRole('searchbox', { name: 'Buscar documentos' });

    const chamadasAntes = vi.mocked(globalThis.fetch).mock.calls.length;
    await userEvent.type(campo, 'protocolo');

    const novas = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(chamadasAntes)
      .map((call) => String(call[0]));
    expect(novas.filter((url) => url.includes('/files/search'))).toEqual([]);
  });

  it('acionar o campo conduz aos resultados com o termo já aplicado, sem redigitar', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': { status: 200, body: COLABORADOR },
      'GET /files/search': { status: 200, body: { files: [] } },
    });

    renderApp(['/']);
    await screen.findByText('O que você pode fazer');

    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    const campo = within(cabecalho).getByRole('searchbox', { name: 'Buscar documentos' });
    await userEvent.type(campo, 'protocolo{Enter}');

    // Chegou à tela de busca com o termo aplicado — e consultado.
    expect(await screen.findByRole('button', { name: /Limpar filtros/ })).toBeInTheDocument();
    const campoDaBusca = screen.getByPlaceholderText('Buscar por nome');
    expect(campoDaBusca).toHaveValue('protocolo');

    const consultas = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/files/search'));
    expect(consultas.length).toBeGreaterThan(0);
    expect(consultas[0]).toContain('q=protocolo');
  });

  it('em 375px o cabeçalho acomoda o campo sem perder o acionador da navegação', async () => {
    mockViewportWidth(375);
    mockFetch({ ...ROTAS_DA_TELA_INICIAL, 'GET /auth/me': { status: 200, body: COLABORADOR } });

    renderApp(['/']);
    // O veredito do breakpoint chega um render depois da montagem: esperar a
    // marca do modo estreito antes de afirmar o resto (ver `viewport.ts`).
    const acionador = await screen.findByRole('button', { name: 'Abrir navegação' });

    const cabecalho = document.querySelector('.ant-layout-header') as HTMLElement;
    expect(acionador).toBeInTheDocument();
    const campo = within(cabecalho).getByRole('searchbox', { name: 'Buscar documentos' });
    expect(campo).toBeInTheDocument();

    // Abaixo do limiar, nada no cabeçalho declara largura em pixel que
    // estouraria a linha: o campo ocupa o espaço restante.
    expect(campo.closest('.ant-input-group-wrapper')).not.toHaveStyle({ width: '320px' });

    // As duas economias de largura medidas em 375px — sem elas o `input` do
    // campo colapsava para **zero**, e a caixa aparecia sem dar para digitar.
    // O jsdom não tem layout para medir; o que se trava aqui é a decisão.
    // O botão da busca cai para a forma só-ícone (sem `enterButton`)…
    expect(cabecalho.querySelector('.ant-input-search-button')).toHaveClass('ant-btn-icon-only');
    // …e o rótulo de identidade sai do cabeçalho.
    expect(within(cabecalho).queryByText('Maria Silva')).not.toBeInTheDocument();
    // A identidade continua presente: iniciais do **nome** no avatar, e o
    // nome completo no `title` do acionador do menu.
    expect(within(cabecalho).getByText('MS')).toBeInTheDocument();
    expect(cabecalho.querySelector('[title="Maria Silva"]')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(IDENTIFICADOR);
  });
});
