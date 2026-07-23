import { useEffect } from 'react';
import { App, Form, Input, Modal } from 'antd';
import type { UnitResponse } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { useCreateUnit, useUpdateUnit } from './queries';

interface UnidadeFormModalProps {
  /** `undefined` ⇒ modo criar; presente ⇒ modo renomear, pré-preenchido. */
  target: UnitResponse | undefined;
  open: boolean;
  onClose: () => void;
}

interface UnidadeFormValues {
  name: string;
}

/**
 * `Modal` + `Form` de criar/renomear unidade (change `gestao-de-unidades`,
 * `web-unidades`). Criar chama `POST /units`; renomear chama `PATCH /units/:id`
 * (só o nome). 409 (nome já em uso) sinaliza no campo, mantendo o modal aberto
 * — mesmo padrão do e-mail duplicado em `PessoaFormModal`.
 */
export function UnidadeFormModal({ target, open, onClose }: UnidadeFormModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<UnidadeFormValues>();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();

  const isEdit = target !== undefined;

  useEffect(() => {
    if (!open) return;
    if (target) {
      form.setFieldsValue({ name: target.name });
    } else {
      form.resetFields();
    }
  }, [open, target, form]);

  async function handleSubmit(values: UnidadeFormValues) {
    const name = values.name.trim();
    try {
      if (target) {
        await updateUnit.mutateAsync({ id: target.id, body: { name } });
      } else {
        await createUnit.mutateAsync({ name });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        form.setFields([{ name: 'name', errors: ['Nome já está em uso'] }]);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        message.error('Permissão insuficiente para executar esta ação.');
        return;
      }
      message.error('Não foi possível concluir a ação. Tente novamente.');
    }
  }

  return (
    <Modal
      title={isEdit ? 'Renomear unidade' : 'Nova unidade'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={createUnit.isPending || updateUnit.isPending}
      okText={isEdit ? 'Salvar' : 'Criar'}
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form<UnidadeFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="Nome" rules={[{ required: true, message: 'Informe um nome' }]}>
          <Input autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
