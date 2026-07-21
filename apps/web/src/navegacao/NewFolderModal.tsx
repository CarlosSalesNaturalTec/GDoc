import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';

interface NewFolderFormValues {
  name: string;
}

interface NewFolderModalProps {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

/** `POST /folders` com o `parentId` da pasta corrente (design.md, tasks 4.1). */
export function NewFolderModal({ open, submitting, onCancel, onSubmit }: NewFolderModalProps) {
  const [form] = Form.useForm<NewFolderFormValues>();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  return (
    <Modal
      title="Nova pasta"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Criar"
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form<NewFolderFormValues>
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit(values.name)}
      >
        <Form.Item name="name" label="Nome" rules={[{ required: true, message: 'Informe um nome' }]}>
          <Input autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
