import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@gdoc/shared';
import type { MyProfileResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

const COLLABORATOR = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };

const PROFILE: MyProfileResponse = {
  fullName: 'Fulano de Tal',
  email: 'fulano@example.com',
  unitName: 'Unidade A',
  role: UserRole.COLLABORATOR,
};

function requestBodies(method: string, path: string): unknown[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    .filter((call) => String(call[0]).includes(path) && (call[1] as RequestInit | undefined)?.method === method)
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

describe('Minha conta (US 1.3, web-minha-conta)', () => {
  it('exibe os dados cadastrais somente para consulta, sem campo editável', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /auth/profile': { status: 200, body: PROFILE },
    });

    renderApp(['/minha-conta']);

    const card = (await screen.findByText('Dados cadastrais')).closest('.ant-card') as HTMLElement;
    expect(within(card).getByText('Fulano de Tal')).toBeInTheDocument();
    expect(within(card).getByText('fulano@example.com')).toBeInTheDocument();
    expect(within(card).getByText('Unidade A')).toBeInTheDocument();
    expect(within(card).getByText('Colaborador')).toBeInTheDocument();

    // dados cadastrais: nenhum input de texto associado a esses valores
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('troca bem-sucedida mantém a pessoa autenticada e limpa os campos', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /auth/profile': { status: 200, body: PROFILE },
      'POST /auth/password': { status: 204 },
    });

    renderApp(['/minha-conta']);
    await screen.findByText('Fulano de Tal');

    await userEvent.type(screen.getByLabelText('Senha atual'), 'senha-atual-correta');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-nova-valida');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await waitFor(() => {
      const bodies = requestBodies('POST', '/auth/password') as Record<string, unknown>[];
      expect(bodies).toEqual([{ currentPassword: 'senha-atual-correta', newPassword: 'senha-nova-valida' }]);
    });

    await screen.findByText('Senha alterada com sucesso.');
    // campos limpos após o sucesso
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    // a pessoa continua na aplicação — nenhum redirecionamento ao login
    expect(screen.getByText('Minha conta')).toBeInTheDocument();
  });

  it('nova senha curta é barrada antes do envio, sem chamar a API', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /auth/profile': { status: 200, body: PROFILE },
    });

    renderApp(['/minha-conta']);
    await screen.findByText('Fulano de Tal');

    await userEvent.type(screen.getByLabelText('Senha atual'), 'senha-atual-correta');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'curta');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await screen.findByText(/precisa ter ao menos/i);
    expect(requestBodies('POST', '/auth/password')).toHaveLength(0);
  });

  it('senha atual incorreta exibe a causa específica, preservando a nova senha', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /auth/profile': { status: 200, body: PROFILE },
      'POST /auth/password': { status: 400, body: { error: 'current password is incorrect' } },
    });

    renderApp(['/minha-conta']);
    await screen.findByText('Fulano de Tal');

    await userEvent.type(screen.getByLabelText('Senha atual'), 'senha-errada');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'senha-nova-valida');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await screen.findByText('Senha atual incorreta');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('senha-nova-valida');
  });
});
