import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PersonStatus, UserRole } from '@gdoc/shared';
import type { PersonResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

const UNIT_ADMIN = { id: 'admin-1', unitId: 'unit-1', role: UserRole.UNIT_ADMIN };
const GLOBAL_ADMIN = { id: 'admin-g', unitId: 'unit-1', role: UserRole.GLOBAL_ADMIN };

function person(overrides: Partial<PersonResponse> & { id: string }): PersonResponse {
  return {
    unitId: 'unit-1',
    fullName: 'Fulano de Tal',
    email: `${overrides.id}@example.com`,
    phone: null,
    jobTitle: null,
    workArea: null,
    notes: null,
    role: UserRole.COLLABORATOR,
    status: PersonStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Mesma limitação de `useId` documentada em `explorer.test.tsx`: localiza pelo título, não por role+name. */
async function findDialogByTitle(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const dialog = screen.getAllByRole('dialog').find((el) => el.textContent?.startsWith(title));
    if (!dialog) throw new Error(`dialog "${title}" ainda não está no DOM`);
    return dialog;
  });
}

function requestBodies(method: string, path: string): unknown[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    .filter((call) => String(call[0]).includes(path) && (call[1] as RequestInit | undefined)?.method === method)
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

/**
 * Botão de confirmação do `Popconfirm` pelo texto exato. Usa a lista já
 * resolvida de `getAllByRole` (síncrona) em vez de `findByRole`/`waitFor` —
 * ao reabrir um segundo `Popconfirm` na mesma linha (mesma posição na
 * árvore, só props diferentes), a busca assíncrona nunca resolve em jsdom.
 */
function confirmButton(label: string): HTMLElement {
  const button = screen.getAllByRole('button').find((b) => b.textContent === label);
  if (!button) throw new Error(`botão "${label}" não encontrado`);
  return button;
}

/** Abre o `Select` de papel dentro do diálogo e clica na opção pelo rótulo (padrão de `permissoes.test.tsx`). */
async function selectRole(dialog: HTMLElement, label: string): Promise<void> {
  await userEvent.click(within(dialog).getByRole('combobox'));
  const dropdown = await waitFor(() => {
    const el = document.querySelector('.ant-select-dropdown');
    if (!el) throw new Error('dropdown do Select ainda não está no DOM');
    return el as HTMLElement;
  });
  await userEvent.click(await within(dropdown).findByText(label));
}

describe('Gestão de pessoas da SPA (web-pessoas)', () => {
  it('administrador lista as pessoas do seu alcance; pessoa sem nome cai no e-mail (spec: administrador lista / pessoa sem nome cai no e-mail)', async () => {
    const comNome = person({
      id: 'person-1',
      fullName: 'Beltrano Silva',
      email: 'beltrano@example.com',
      jobTitle: 'Analista',
      role: UserRole.UNIT_ADMIN,
    });
    const semNome = person({ id: 'person-2', fullName: null, email: 'semnome@example.com' });

    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [comNome, semNome] },
    });

    renderApp(['/admin/pessoas']);

    await screen.findByText('Beltrano Silva');
    const row = screen.getByText('Beltrano Silva').closest('tr')!;
    expect(within(row).getByText('beltrano@example.com')).toBeInTheDocument();
    expect(within(row).getByText('Analista')).toBeInTheDocument();
    expect(within(row).getByText('Administrador da unidade')).toBeInTheDocument();
    expect(within(row).getByText('Ativa')).toBeInTheDocument();

    // pessoa sem nome cai no e-mail
    expect(screen.getAllByText('semnome@example.com').length).toBeGreaterThan(0);
  });

  it('cadastro válido chama POST /users, fecha o modal e a nova pessoa aparece; confirmar sem senha é bloqueado (spec: cadastro válido / senha é exigida)', async () => {
    const novaPessoa = person({
      id: 'person-novo',
      fullName: 'Ciclana Souza',
      email: 'ciclana@example.com',
      role: UserRole.COLLABORATOR,
    });

    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': [{ status: 200, body: [] }, { status: 200, body: [novaPessoa] }],
      'POST /users': { status: 201, body: novaPessoa },
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Nova pessoa');
    await userEvent.click(screen.getByRole('button', { name: /nova pessoa/i }));

    const dialog = await findDialogByTitle('Nova pessoa');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Ciclana Souza');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'ciclana@example.com');
    await selectRole(dialog, 'Colaborador');

    // confirmar sem senha é bloqueado
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar' }));
    await within(dialog).findByText('Informe uma senha');
    expect(requestBodies('POST', '/users')).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'segredo123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      const bodies = requestBodies('POST', '/users') as Record<string, unknown>[];
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        fullName: 'Ciclana Souza',
        email: 'ciclana@example.com',
        password: 'segredo123',
        role: 'collaborator',
      });
      expect(bodies[0]!.unitId).toBeUndefined();
    });

    await screen.findByText('Ciclana Souza');
  });

  it('e-mail duplicado (409) exibe "e-mail já está em uso" e mantém o modal aberto com os campos preenchidos (spec: e-mail duplicado)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [] },
      'POST /users': { status: 409, body: { error: 'email already in use' } },
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Nova pessoa');
    await userEvent.click(screen.getByRole('button', { name: /nova pessoa/i }));

    const dialog = await findDialogByTitle('Nova pessoa');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Fulano Repetido');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'ja-existe@example.com');
    await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'segredo123');
    await selectRole(dialog, 'Colaborador');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar' }));

    await within(dialog).findByText('E-mail já está em uso');
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Fulano Repetido');
    expect(within(dialog).getByLabelText('E-mail')).toHaveValue('ja-existe@example.com');
  });

  it('edição altera os dados da pessoa via PATCH /users/:id; o formulário não tem senha e o e-mail é somente-leitura (spec: edição altera os dados / não expõe senha nem e-mail)', async () => {
    const pessoa = person({ id: 'person-1', fullName: 'Beltrano Silva', email: 'beltrano@example.com' });
    const pessoaEditada = { ...pessoa, fullName: 'Beltrano Souza' };

    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': [{ status: 200, body: [pessoa] }, { status: 200, body: [pessoaEditada] }],
      'PATCH /users/person-1': { status: 200, body: pessoaEditada },
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Beltrano Silva');
    const row = screen.getByText('Beltrano Silva').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }));

    const dialog = await findDialogByTitle('Editar pessoa');
    expect(within(dialog).queryByLabelText('Senha inicial')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('E-mail')).toBeDisabled();

    const nameInput = within(dialog).getByLabelText('Nome');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Beltrano Souza');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const bodies = requestBodies('PATCH', '/users/person-1') as Record<string, unknown>[];
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ fullName: 'Beltrano Souza' });
      expect(bodies[0]!.email).toBeUndefined();
      expect(bodies[0]!.password).toBeUndefined();
    });

    await screen.findByText('Beltrano Souza');
  });

  it('desativar chama PATCH com status disabled após confirmação; reativar chama com status active; não há ação de exclusão (spec: desativar / reativar / não há exclusão permanente)', async () => {
    const ativa = person({ id: 'person-1', fullName: 'Beltrano Silva', status: PersonStatus.ACTIVE });
    const inativa = { ...ativa, status: PersonStatus.DISABLED };

    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': [{ status: 200, body: [ativa] }, { status: 200, body: [inativa] }, { status: 200, body: [ativa] }],
      'PATCH /users/person-1': [{ status: 200, body: inativa }, { status: 200, body: ativa }],
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Beltrano Silva');

    let row = screen.getByText('Beltrano Silva').closest('tr')!;
    expect(within(row).queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Desativar' }));
    await userEvent.click(confirmButton('Sim, desativar'));

    await waitFor(() => expect(screen.getByText('Inativa')).toBeInTheDocument());

    row = screen.getByText('Beltrano Silva').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Ativar' }));
    await userEvent.click(confirmButton('Sim, ativar'));

    await waitFor(() => expect(screen.getByText('Ativa')).toBeInTheDocument());

    const bodies = requestBodies('PATCH', '/users/person-1') as Record<string, unknown>[];
    expect(bodies).toEqual([{ status: 'disabled' }, { status: 'active' }]);
  });

  it('trava de papel: unit_admin não vê global_admin no seletor, global_admin vê; própria linha esconde desativar/rebaixar; 403 exibe aviso neutro (spec: travas de papel / 403 fail-closed neutro)', async () => {
    const selfAsUnitAdmin = person({
      id: 'admin-1',
      fullName: 'Admin Um',
      email: 'admin1@example.com',
      role: UserRole.UNIT_ADMIN,
    });
    const outraPessoa = person({ id: 'person-2', fullName: 'Outra Pessoa' });

    mockFetch({
      'GET /auth/me': { status: 200, body: UNIT_ADMIN },
      'GET /users': { status: 200, body: [selfAsUnitAdmin, outraPessoa] },
      'PATCH /users/person-2': { status: 403, body: { error: 'forbidden' } },
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Admin Um');

    // própria linha: sem ação de desativar
    const selfRow = screen.getByText('Admin Um').closest('tr')!;
    expect(within(selfRow).queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();

    // própria linha, modo editar: seletor de papel não oferece rebaixar (Colaborador) nem global_admin
    await userEvent.click(within(selfRow).getByRole('button', { name: 'Editar' }));
    const selfDialog = await findDialogByTitle('Editar pessoa');
    await userEvent.click(within(selfDialog).getByRole('combobox'));
    let dropdown = await waitFor(() => document.querySelector('.ant-select-dropdown') as HTMLElement);
    expect(within(dropdown).queryByText('Colaborador')).not.toBeInTheDocument();
    expect(within(dropdown).queryByText('Administrador global')).not.toBeInTheDocument();
    expect(within(dropdown).getByText('Administrador da unidade')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(selfDialog).getByRole('button', { name: 'Cancelar' }));

    // cadastro: unit_admin não vê global_admin
    await userEvent.click(screen.getByRole('button', { name: /nova pessoa/i }));
    const createDialog = await findDialogByTitle('Nova pessoa');
    await userEvent.click(within(createDialog).getByRole('combobox'));
    dropdown = await waitFor(() => document.querySelector('.ant-select-dropdown') as HTMLElement);
    expect(within(dropdown).queryByText('Administrador global')).not.toBeInTheDocument();
    expect(within(dropdown).getByText('Colaborador')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(createDialog).getByRole('button', { name: 'Cancelar' }));

    // 403 ao editar outra pessoa exibe aviso neutro, sem aplicar mudança
    const otherRow = screen.getByText('Outra Pessoa').closest('tr')!;
    await userEvent.click(within(otherRow).getByRole('button', { name: 'Editar' }));
    const otherDialog = await findDialogByTitle('Editar pessoa');
    await userEvent.click(within(otherDialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Permissão insuficiente para executar esta ação.');
  });

  it('global_admin vê a opção global_admin no seletor de papel (spec: global_admin vê a opção global_admin)', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: GLOBAL_ADMIN },
      'GET /users': { status: 200, body: [] },
    });

    renderApp(['/admin/pessoas']);
    await screen.findByText('Nova pessoa');
    await userEvent.click(screen.getByRole('button', { name: /nova pessoa/i }));

    const dialog = await findDialogByTitle('Nova pessoa');
    await userEvent.click(within(dialog).getByRole('combobox'));
    const dropdown = await waitFor(() => document.querySelector('.ant-select-dropdown') as HTMLElement);
    expect(within(dropdown).getByText('Administrador global')).toBeInTheDocument();
  });
});
