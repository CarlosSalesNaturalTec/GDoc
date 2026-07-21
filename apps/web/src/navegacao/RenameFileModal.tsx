import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { FileSummaryResponse } from '@gdoc/shared';

interface RenameFileFormValues {
  fileName: string;
}

interface RenameFileModalProps {
  file: FileSummaryResponse | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (fileName: string) => void;
}

/** `PATCH /files/:id`; renomear pasta fica fora desta fatia (design.md D7). */
export function RenameFileModal({ file, submitting, onCancel, onSubmit }: RenameFileModalProps) {
  const [form] = Form.useForm<RenameFileFormValues>();

  useEffect(() => {
    if (file) form.setFieldsValue({ fileName: file.fileName });
  }, [file, form]);

  return (
    <Modal
      title="Renomear arquivo"
      open={file !== null}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Renomear"
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form<RenameFileFormValues>
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit(values.fileName)}
      >
        <Form.Item
          name="fileName"
          label="Nome"
          rules={[{ required: true, message: 'Informe um nome' }]}
        >
          <Input autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
