import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('E-mail'), email);
  await userEvent.type(screen.getByLabelText('Senha'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login (US 1.2)', () => {
  it('credenciais válidas navegam ao shell autenticado (cenário 1)', async () => {
    mockFetch({
      'GET /auth/me': { status: 401 },
      'POST /auth/login': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
    });
    renderApp(['/login']);

    await screen.findByRole('heading', { name: 'GDoc' });
    await fillAndSubmit('ana@example.com', 'senha-correta');

    await screen.findByText('Bem-vindo ao GDoc');
  });

  it('credenciais inválidas mostram mensagem genérica e permanecem no login (cenário 2)', async () => {
    mockFetch({
      'GET /auth/me': { status: 401 },
      'POST /auth/login': { status: 401, body: { error: 'invalid credentials' } },
    });
    renderApp(['/login']);

    await screen.findByRole('heading', { name: 'GDoc' });
    await fillAndSubmit('ana@example.com', 'senha-errada');

    await screen.findByText('E-mail ou senha inválidos.');
    expect(screen.getByRole('heading', { name: 'GDoc' })).toBeInTheDocument();
  });

  it('conta desativada mostra aviso específico, distinto da mensagem genérica (cenário 3)', async () => {
    mockFetch({
      'GET /auth/me': { status: 401 },
      'POST /auth/login': { status: 403, body: { error: 'account disabled' } },
    });
    renderApp(['/login']);

    await screen.findByRole('heading', { name: 'GDoc' });
    await fillAndSubmit('ana@example.com', 'senha-correta');

    await screen.findByText('Esta conta está desativada. Procure a administração.');
    expect(screen.queryByText('E-mail ou senha inválidos.')).not.toBeInTheDocument();
  });
});
