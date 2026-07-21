import { useMemo } from 'react';
import { Alert, App, Button, Checkbox, Divider, Empty, Form, Modal, Popconfirm, Select, Space, Tag } from 'antd';
import type { GrantResponse } from '@gdoc/shared';
import { GrantResourceType, Permission } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { useSession } from '../auth/session-context';
import { useAuthorOptions } from '../busca/queries';
import { useCreateGrant, useGrants, useRevokeGrant } from './queries';

interface PermissoesModalProps {
  resourceType: GrantResourceType;
  resourceId: string;
  resourceName: string;
  open: boolean;
  onClose: () => void;
}

interface GrantFormValues {
  subjectUserId: string;
  permissions: Permission[];
}

/** Rótulo pt-BR por verbo (design.md D6) — fonte única é o enum `Permission` de `@gdoc/shared`. */
const VERB_LABEL: Record<Permission, string> = {
  [Permission.VIEW]: 'Visualizar',
  [Permission.DOWNLOAD]: 'Baixar',
  [Permission.UPLOAD]: 'Enviar',
  [Permission.RENAME]: 'Renomear',
  [Permission.DELETE]: 'Excluir',
};

const VERB_OPTIONS = Object.values(Permission).map((permission) => ({
  value: permission,
  label: VERB_LABEL[permission],
}));

/**
 * Diálogo de gestão de permissões de um recurso (US 4.1, `web-permissoes`,
 * design.md D1). Ponto de entrada é a ação "Permissões" por-linha do
 * explorador — não existe tela global, pois `GET /grants` é sempre por
 * recurso.
 */
export function PermissoesModal({ resourceType, resourceId, resourceName, open, onClose }: PermissoesModalProps) {
  const { message } = App.useApp();
  const { identity } = useSession();
  const [form] = Form.useForm<GrantFormValues>();

  const { data: grantsData } = useGrants(resourceType, resourceId, open);
  const authorOptions = useAuthorOptions(identity?.role);
  const createGrant = useCreateGrant(resourceType, resourceId);
  const revokeGrant = useRevokeGrant(resourceType, resourceId);

  // design.md D4: nome vem do mapa id→nome de `GET /users`; sem correspondência
  // (ou falha da chamada) cai no próprio UUID como rótulo — degradação suave.
  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of authorOptions.data ?? []) {
      map.set(option.value, option.label);
    }
    return map;
  }, [authorOptions.data]);

  const grantsByPerson = useMemo(() => {
    const map = new Map<string, GrantResponse[]>();
    for (const grant of grantsData?.grants ?? []) {
      const list = map.get(grant.subjectUserId) ?? [];
      list.push(grant);
      map.set(grant.subjectUserId, list);
    }
    return map;
  }, [grantsData]);

  // design.md Risks: 404 (recurso/pessoa inexistente ou de outra unidade) e
  // 403 não são distinguidos — mensagem neutra, preservando o fail-closed do servidor.
  function handleMutationError(err: unknown) {
    if (err instanceof ApiError) {
      message.error('Não foi possível concluir a operação de permissões.');
      return;
    }
    message.error('Não foi possível concluir a operação. Tente novamente.');
  }

  async function handleGrant(values: GrantFormValues) {
    try {
      await createGrant.mutateAsync({
        subjectUserId: values.subjectUserId,
        resourceType,
        resourceId,
        permissions: values.permissions,
      });
      form.resetFields();
    } catch (err) {
      handleMutationError(err);
    }
  }

  async function handleRevoke(grantId: string) {
    try {
      await revokeGrant.mutateAsync(grantId);
    } catch (err) {
      handleMutationError(err);
    }
  }

  return (
    <Modal
      title={`Permissões — ${resourceName}`}
      open={open}
      onCancel={onClose}
      footer={
        <Button onClick={onClose}>Fechar</Button>
      }
      destroyOnClose
      width={640}
    >
      {resourceType === GrantResourceType.FOLDER && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Concessão vale só para esta pasta"
          description="Conceder um verbo aqui libera apenas a própria pasta — não propaga acesso aos arquivos e subpastas internos, que exigem concessão própria."
        />
      )}

      <Form<GrantFormValues> form={form} layout="vertical" onFinish={handleGrant}>
        <Form.Item
          name="subjectUserId"
          label="Pessoa"
          rules={[{ required: true, message: 'Selecione uma pessoa' }]}
        >
          <Select
            showSearch
            placeholder="Selecione uma pessoa"
            loading={authorOptions.isLoading}
            disabled={authorOptions.isError}
            options={authorOptions.data ?? []}
            optionFilterProp="label"
          />
        </Form.Item>
        {authorOptions.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Não foi possível carregar a lista de pessoas. Concessão indisponível no momento."
          />
        )}
        <Form.Item
          name="permissions"
          label="Verbos"
          rules={[{ required: true, type: 'array', min: 1, message: 'Selecione ao menos um verbo' }]}
        >
          <Checkbox.Group options={VERB_OPTIONS} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={createGrant.isPending}>
            Conceder
          </Button>
        </Form.Item>
      </Form>

      <Divider />

      <h4>Concessões vigentes</h4>
      <div>
        {grantsByPerson.size === 0 ? (
          <Empty description="Nenhuma concessão" />
        ) : (
          Array.from(grantsByPerson.entries()).map(([subjectUserId, grants]) => (
            <div key={subjectUserId} style={{ marginBottom: 12 }}>
              <strong>{personNameById.get(subjectUserId) ?? subjectUserId}</strong>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {grants.map((grant) => (
                  <Space key={grant.id}>
                    <Tag>{VERB_LABEL[grant.permission]}</Tag>
                    <Popconfirm
                      title="Revogar permissão"
                      description={`Remover "${VERB_LABEL[grant.permission]}" desta pessoa sobre este recurso?`}
                      okText="Sim, revogar"
                      cancelText="Cancelar"
                      onConfirm={() => handleRevoke(grant.id)}
                    >
                      <Button size="small" danger>
                        Revogar
                      </Button>
                    </Popconfirm>
                  </Space>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
