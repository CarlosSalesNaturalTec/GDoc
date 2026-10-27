import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import type { MyProfileResponse, PersonResponse } from '@gdoc/shared';
import { PersonStatus } from '@gdoc/shared';
import { ROLE_LABEL } from '../shell/role-label';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

/**
 * Rótulo do papel de acesso (capability `nomenclatura-interface`, requisitos
 * "Rótulo do papel de acesso preservado" e "Rótulo do papel é idêntico em
 * toda a interface"; change `identidade-visual-isetes`, design.md D7).
 *
 * O mapa estava triplicado em `shell/AppShell`, `conta/MinhaContaPage` e
 * `pessoas/PessoaFormModal`. Esta suíte percorre as **três** telas que
 * exibem o papel e exige o mesmo texto nas três — é o que impede uma delas
 * de ficar para trás numa troca de nomenclatura futura.
 */

const UNIT_ADMIN = { id: 'user-1', unitId: 'unit-1', role: UserRole.UNIT_ADMIN };

const PERFIL: MyProfileResponse = {
  fullName: 'Fulana Gestora',
  email: 'fulana@example.com',
  unitName: 'Unidade A',
  role: UserRole.UNIT_ADMIN,
};

const PESSOA: PersonResponse = {
  id: 'user-1',
  unitId: 'unit-1',
  email: 'fulana@example.com',
  fullName: 'Fulana Gestora',
  phone: null,
  jobTitle: 'Coordenação',
  workArea: null,
  notes: null,
  role: UserRole.UNIT_ADMIN,
  status: PersonStatus.ACTIVE,
  storageUsedBytes: 0,
  storageQuotaBytes: null,
  createdAt: '2026-07-01T10:00:00.000Z',
};

describe('Rótulo do papel de acesso (nomenclatura-interface)', () => {
  it('o papel com privilégio administrativo de unidade é rotulado "Gestor"', () => {
    expect(ROLE_LABEL[UserRole.UNIT_ADMIN]).toBe('Gestor');
  });

  it('"Colaborador" e "Administrador global" permanecem inalterados', () => {
    expect(ROLE_LABEL[UserRole.COLLABORATOR]).toBe('Colaborador');
    expect(ROLE_LABEL[UserRole.GLOBAL_ADMIN]).toBe('Administrador global');
  });

  it('o shell autenticado exibe o rótulo da origem única', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [] },
    });
    renderApp(['/admin/pessoas']);

    await screen.findByText('Novo colaborador');
    expect(screen.getByText(ROLE_LABEL[UserRole.UNIT_ADMIN])).toBeInTheDocument();
  });

  it('o perfil da própria conta exibe o mesmo rótulo do shell', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /auth/profile': { status: 200, body: PERFIL },
    });
    renderApp(['/minha-conta']);

    await screen.findByText('fulana@example.com');
    // Duas ocorrências na tela — a do shell e a do campo "Papel" —, e é
    // justamente a igualdade entre elas que o requisito exige.
    expect(screen.getAllByText(ROLE_LABEL[UserRole.UNIT_ADMIN]).length).toBeGreaterThanOrEqual(2);
  });

  it('a listagem de colaboradores e o seletor de papel exibem o mesmo rótulo', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [PESSOA] },
    });
    renderApp(['/admin/pessoas']);

    const linha = (await screen.findByText('Fulana Gestora')).closest('tr')!;
    expect(within(linha).getByText(ROLE_LABEL[UserRole.UNIT_ADMIN])).toBeInTheDocument();

    await userEvent.click(within(linha).getByRole('button', { name: 'Editar' }));
    const combobox = await screen.findByRole('combobox');
    await userEvent.click(combobox);
    const dropdown = await waitFor(
      () => document.querySelector('.ant-select-dropdown') as HTMLElement,
    );
    expect(within(dropdown).getByText(ROLE_LABEL[UserRole.UNIT_ADMIN])).toBeInTheDocument();
  });

  it('o rótulo anterior não aparece em texto visível em nenhuma das telas', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [PESSOA] },
    });
    renderApp(['/admin/pessoas']);

    await screen.findByText('Fulana Gestora');
    expect(document.body.textContent).not.toMatch(/Administrador da unidade/);
  });
});
