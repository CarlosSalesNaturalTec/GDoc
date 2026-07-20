import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

describe('Guarda de rota por papel e shell condicionado ao papel', () => {
  it('collaborator não vê itens de administração e é impedido de acessar /admin/pessoas', async () => {
    mockFetch({
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
    });
    renderApp(['/admin/pessoas']);

    // guarda por papel: navegado de volta para a home, a tela de admin nunca renderiza
    await screen.findByText('Bem-vindo ao GDoc');
    expect(screen.queryByText('Gestão de pessoas')).not.toBeInTheDocument();
    expect(screen.queryByText('Pessoas')).not.toBeInTheDocument();
    expect(screen.queryByText('Painel')).not.toBeInTheDocument();
    expect(screen.getByText('Colaborador')).toBeInTheDocument();
  });

  it('admin da unidade vê os itens de administração e acessa /admin/pessoas', async () => {
    mockFetch({
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.UNIT_ADMIN },
      },
    });
    renderApp(['/admin/pessoas']);

    await screen.findByText('Gestão de pessoas');
    expect(screen.getByText('Pessoas')).toBeInTheDocument();
    expect(screen.getByText('Painel')).toBeInTheDocument();
    expect(screen.getByText('Administrador da unidade')).toBeInTheDocument();
  });
});
