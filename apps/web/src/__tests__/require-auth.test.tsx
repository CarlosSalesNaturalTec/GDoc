import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch, ROTAS_DA_TELA_INICIAL } from './mock-fetch';
import { renderApp } from './render-app';

describe('Guarda de rota por autenticação', () => {
  it('rota protegida sem sessão redireciona a /login', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 } });
    renderApp(['/']);

    await screen.findByRole('heading', { name: 'PapelHub' });
  });

  it('bootstrap de sessão via GET /auth/me entra autenticado sem novo login', async () => {
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
    });
    renderApp(['/']);

    await screen.findByText('O que você pode fazer');
  });

  it('logout encerra a sessão e volta ao login', async () => {
    mockFetch({
      ...ROTAS_DA_TELA_INICIAL,
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
      'POST /auth/logout': { status: 204 },
    });
    renderApp(['/']);

    await screen.findByText('O que você pode fazer');
    // "Sair" mora no menu de identidade do cabeçalho (change `troca-de-senha`,
    // design.md D5/D6) — precisa abrir o dropdown antes de clicar no item.
    await userEvent.click(screen.getByText('Colaborador'));
    await userEvent.click(await screen.findByText('Sair'));

    await screen.findByRole('heading', { name: 'PapelHub' });
  });
});
