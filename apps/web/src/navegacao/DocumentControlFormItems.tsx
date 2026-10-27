import { DatePicker, Form, Input, InputNumber, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  DOCUMENT_LIFECYCLE_STATES,
  DOCUMENT_TYPES,
  type DocumentControlInput,
  type DocumentLifecycleState,
  type DocumentType,
} from '@gdoc/shared';
import {
  DOCUMENT_LIFECYCLE_LABEL,
  DOCUMENT_TYPE_ACRONYM,
  DOCUMENT_TYPE_LABEL,
} from '../shell/document-control-labels';

/**
 * Campos do formulário de dados de controle (Épico 10), compartilhados entre
 * o envio de **um** documento (`UploadArea`) e a edição posterior
 * (`DocumentControlModal`).
 *
 * Um componente só porque os dois lugares pedem os mesmos campos, com as
 * mesmas regras de preenchimento — duas cópias divergiriam na primeira
 * correção de rótulo. O que varia é a **obrigatoriedade**: no envio os quatro
 * campos do requisito são exigidos antes de publicar; na edição nada é
 * exigido, porque editar serve justamente para preencher aos poucos o que o
 * lote dispensou.
 */
export interface DocumentControlFormValues {
  documentType?: DocumentType | null;
  documentCode?: string | null;
  documentRevision?: number | null;
  responsibleSector?: string | null;
  nextReviewAt?: Dayjs | null;
  lifecycleState?: DocumentLifecycleState | null;
}

/** Valores do formulário → corpo da API (`YYYY-MM-DD`, sem hora nem fuso). */
export function toDocumentControlInput(values: DocumentControlFormValues): DocumentControlInput {
  const input: DocumentControlInput = {};
  if ('documentType' in values) input.documentType = values.documentType ?? null;
  if ('documentCode' in values) input.documentCode = values.documentCode ?? null;
  if ('documentRevision' in values) input.documentRevision = values.documentRevision ?? null;
  if ('responsibleSector' in values) input.responsibleSector = values.responsibleSector ?? null;
  if ('nextReviewAt' in values) {
    input.nextReviewAt = values.nextReviewAt ? values.nextReviewAt.format('YYYY-MM-DD') : null;
  }
  if ('lifecycleState' in values) input.lifecycleState = values.lifecycleState ?? null;
  return input;
}

const TYPE_OPTIONS = DOCUMENT_TYPES.map((tipo) => ({
  value: tipo,
  label: `${DOCUMENT_TYPE_ACRONYM[tipo]} — ${DOCUMENT_TYPE_LABEL[tipo]}`,
}));

const LIFECYCLE_OPTIONS = DOCUMENT_LIFECYCLE_STATES.map((estado) => ({
  value: estado,
  label: DOCUMENT_LIFECYCLE_LABEL[estado],
}));

export function DocumentControlFormItems({
  obrigatorios,
  incluirEstado = false,
}: {
  /** Exige tipo, código, revisão e data — o envio de um documento (US 10.5). */
  obrigatorios: boolean;
  /** Oferece o estado declarado (vigente/em revisão/obsoleto) — só na edição. */
  incluirEstado?: boolean;
}) {
  return (
    <>
      <Form.Item
        name="documentType"
        label="Tipo"
        rules={obrigatorios ? [{ required: true, message: 'Informe o tipo do documento' }] : []}
      >
        <Select options={TYPE_OPTIONS} placeholder="Selecione o tipo" allowClear={!obrigatorios} />
      </Form.Item>
      <Form.Item
        name="documentCode"
        label="Código"
        extra="Único na sua unidade. Ex.: PRT-NSP-001."
        rules={obrigatorios ? [{ required: true, message: 'Informe o código do documento' }] : []}
      >
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item
        name="documentRevision"
        label="Revisão"
        extra="Número da revisão vigente; apresentado como Rev. 02."
        rules={obrigatorios ? [{ required: true, message: 'Informe a revisão' }] : []}
      >
        <InputNumber min={0} max={9999} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="responsibleSector" label="Setor responsável">
        <Input maxLength={120} />
      </Form.Item>
      <Form.Item
        name="nextReviewAt"
        label="Próxima revisão"
        extra="A situação do documento é apurada pelo servidor a partir desta data."
        rules={
          obrigatorios ? [{ required: true, message: 'Informe a data da próxima revisão' }] : []
        }
      >
        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
      </Form.Item>
      {incluirEstado && (
        <Form.Item
          name="lifecycleState"
          label="Situação declarada"
          extra="Em revisão e Obsoleto prevalecem sobre a data. Documento obsoleto deixa de aparecer para quem não é gestão da unidade."
        >
          <Select options={LIFECYCLE_OPTIONS} allowClear placeholder="Vigente" />
        </Form.Item>
      )}
    </>
  );
}
