import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch, ROTAS_DA_TELA_INICIAL } from './mock-fetch';
import { renderApp } from './render-app';
import { mockViewportWidth, WIDE_VIEWPORT } from './viewport';

/**
 * Marca do shell (capability `identidade-visual`).
 *
 * `marca()` só pode ser chamada **depois** de esperar o nome pela árvore
 * inteira: a coluna lateral não existe antes de `GET /auth/me` resolver, e
 * escopar a uma referência nula falha antes de exercitar nada.
 *
 * A change `menu-lateral-e-barra-superior` move o **nome acessível** da marca
 * da imagem para o texto: com "PapelHub" escrito na navegação, manter o `alt`
 * na logomarca faria leitor de tela anunciar a marca duas vezes em sequência
 * (design.md D5). Os casos abaixo travam a forma nova — a imagem decorativa, o
 * nome e o descritor em texto — e preservam o que não mudou: o colapsado sem
 * logomarca e sem descritor, com a abreviação em texto.
 */
function marca(): HTMLElement {
  return document.querySelector('.ant-layout-sider') as HTMLElement;
}

const CONFIG_BASE = {
  ...ROTAS_DA_TELA_INICIAL,
  'GET /auth/me': {
    status: 200,
    body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
  },
};

describe('Identidade visual no shell (identidade-visual)', () => {
  it('identificação do cliente aparece no estado expandido e some no colapsado, mantendo a marca abreviada', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...CONFIG_BASE,
      'GET /auth/public-config': {
        status: 200,
        body: { appName: 'PapelHub', clientName: 'SETES', manualUrl: '' },
      },
    });
    renderApp(['/']);

    await screen.findByText('PapelHub');
    expect(within(marca()).getByText('SETES')).toBeInTheDocument();

    const trigger = document.querySelector('.ant-layout-sider-trigger') as HTMLElement;
    await userEvent.click(trigger);

    await screen.findByText('PH');
    expect(within(marca()).queryByText('SETES')).not.toBeInTheDocument();
  });

  it('no shell expandido, o nome acessível da marca é o texto, e a logomarca é decorativa', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...CONFIG_BASE,
      'GET /auth/public-config': {
        status: 200,
        body: { appName: 'PapelHub', clientName: '', manualUrl: '' },
      },
    });
    renderApp(['/']);

    // O nome vem do texto…
    expect(await screen.findByText('PapelHub')).toBeInTheDocument();
    // …e a logomarca não o repete: nenhuma imagem com nome acessível na marca.
    expect(within(marca()).queryByRole('img', { name: 'PapelHub' })).not.toBeInTheDocument();
  });

  it('a marca expandida apresenta o descritor do produto, constante em qualquer implantação', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...CONFIG_BASE,
      'GET /auth/public-config': {
        status: 200,
        body: { appName: 'PapelHub', clientName: 'SETES', manualUrl: '' },
      },
    });
    renderApp(['/']);

    await screen.findByText('PapelHub');
    // Descritor e identificação do cliente são informações distintas: o
    // primeiro é constante do produto, a segunda vem da implantação.
    expect(within(marca()).getByText('Gestão de Documentos')).toBeInTheDocument();
    expect(within(marca()).getByText('SETES')).toBeInTheDocument();
  });

  it('no shell colapsado, nem logomarca nem descritor — só a abreviação em texto', async () => {
    mockViewportWidth(WIDE_VIEWPORT);
    mockFetch({
      ...CONFIG_BASE,
      'GET /auth/public-config': {
        status: 200,
        body: { appName: 'PapelHub', clientName: '', manualUrl: '' },
      },
    });
    renderApp(['/']);

    await screen.findByText('PapelHub');

    const trigger = document.querySelector('.ant-layout-sider-trigger') as HTMLElement;
    await userEvent.click(trigger);

    await screen.findByText('PH');
    // `queryByRole('img')` casaria com o próprio chevron do controle de
    // recolher (ícone do design system, `role="img"`): o que se afirma aqui é
    // a ausência da **logomarca**, que é um elemento `img`.
    expect(marca().querySelector('img')).toBeNull();
    expect(within(marca()).queryByText('Gestão de Documentos')).not.toBeInTheDocument();
  });
});
