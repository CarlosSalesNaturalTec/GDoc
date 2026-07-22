import { useState } from 'react';
import { App, Button, Popconfirm, Result, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import type { PersonResponse } from '@gdoc/shared';
import { PersonStatus } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { useSession } from '../auth/session-context';
import { ROLE_LABEL, PessoaFormModal } from './PessoaFormModal';
import { useUpdatePerson, useUsers } from './queries';

const STATUS_LABEL: Record<PersonStatus, string> = {
  [PersonStatus.ACTIVE]: 'Ativa',
  [PersonStatus.DISABLED]: 'Inativa',
};

/**
 * Gestão de pessoas pela administração (US 1.1, `web-pessoas`, design.md
 * D1). Substitui o `PlaceholderPage` de `/admin/pessoas` — a guarda de rota
 * `[unit_admin, global_admin]` já existe (Fatia 1 D6).
 */
export function PessoasPage() {
  const { message } = App.useApp();
  const { identity } = useSession();
  const { data, isLoading, isError } = useUsers();
  const updatePerson = useUpdatePerson();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonResponse | null>(null);

  function openCreate() {
    setEditingPerson(null);
    setModalOpen(true);
  }

  function openEdit(person: PersonResponse) {
    setEditingPerson(person);
    setModalOpen(true);
  }

  // design.md D6: 403 (RLS escondeu a linha, ou trava de papel violada por
  // pedido forjado) exibe aviso neutro, sem distinguir os subcasos.
  async function handleToggleStatus(person: PersonResponse) {
    const status = person.status === PersonStatus.ACTIVE ? PersonStatus.DISABLED : PersonStatus.ACTIVE;
    try {
      await updatePerson.mutateAsync({ id: person.id, body: { status } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        message.error('Permissão insuficiente para executar esta ação.');
        return;
      }
      message.error('Não foi possível concluir a ação. Tente novamente.');
    }
  }

  const columns: ColumnsType<PersonResponse> = [
    { title: 'Nome', key: 'name', render: (_, person) => person.fullName ?? person.email },
    { title: 'E-mail', key: 'email', dataIndex: 'email' },
    { title: 'Função', key: 'jobTitle', render: (_, person) => person.jobTitle ?? '—' },
    {
      title: 'Papel',
      key: 'role',
      render: (_, person) => <Tag>{ROLE_LABEL[person.role]}</Tag>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, person) => (
        <Tag color={person.status === PersonStatus.ACTIVE ? 'green' : 'default'}>
          {STATUS_LABEL[person.status]}
        </Tag>
      ),
    },
    {
      title: 'Ações',
      key: 'actions',
      render: (_, person) => {
        // design.md D5: na própria linha, sem ação de desativar — evita o
        // administrador cortar o próprio acesso.
        const isSelf = person.id === identity?.id;
        const isActive = person.status === PersonStatus.ACTIVE;
        return (
          <Space>
            <Button size="small" onClick={() => openEdit(person)}>
              Editar
            </Button>
            {!(isSelf && isActive) && (
              <Popconfirm
                title={isActive ? 'Desativar pessoa' : 'Ativar pessoa'}
                description={
                  isActive
                    ? 'A pessoa perde acesso ao login; os arquivos e a auditoria são preservados.'
                    : 'A pessoa volta a poder fazer login.'
                }
                okText={isActive ? 'Sim, desativar' : 'Sim, ativar'}
                cancelText="Cancelar"
                onConfirm={() => handleToggleStatus(person)}
              >
                <Button size="small" danger={isActive}>
                  {isActive ? 'Desativar' : 'Ativar'}
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (isError) {
    return (
      <Result
        status="error"
        title="Não foi possível carregar as pessoas"
        subTitle="Verifique sua conexão e tente novamente."
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Nova pessoa
        </Button>
      </div>
      <Table<PersonResponse> rowKey="id" columns={columns} dataSource={data ?? []} />
      <PessoaFormModal target={editingPerson ?? undefined} open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
