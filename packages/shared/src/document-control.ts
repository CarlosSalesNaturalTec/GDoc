/**
 * Dados de controle de um documento (Épico 10, change `controle-documental`).
 *
 * Tipos e situações são **constantes de produto** no contrato compartilhado,
 * como `UserRole` e `Permission` (design.md D4) — não taxonomia administrável
 * por unidade, que exigiria tela de administração e tornaria editável uma
 * decisão de identidade visual com contraste já verificado.
 */

/**
 * Conjunto fechado dos oito tipos previstos (US 10.1). Valor fora deste
 * conjunto é recusado pela API — a validação vive em
 * `apps/api/src/lib/document-control.ts`, não no schema do banco (ver o
 * comentário da migration 0016 sobre por que não há CHECK).
 */
export const DocumentType = {
  PROTOCOL: 'protocol',
  PROCEDURE: 'procedure',
  POLICY: 'policy',
  FORM: 'form',
  FLOWCHART: 'flowchart',
  MANUAL: 'manual',
  CONSENT_TERM: 'consent_term',
  INTERNAL_NOTICE: 'internal_notice',
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DOCUMENT_TYPES: readonly DocumentType[] = Object.values(DocumentType);

/**
 * Estado **declarado** por uma pessoa (design.md D3) — distinto da situação
 * derivada abaixo. `null` na leitura significa "vigente, não declarado": o
 * acervo existente não foi migrado, e não precisa ser.
 *
 * Dois campos, e não um só, porque o material do cliente usa a mesma cor
 * âmbar para coisas diferentes: `Em revisão` é declaração de uma pessoa;
 * `Vence em 45 dias` é consequência aritmética de uma data. Um campo único
 * não representaria "documento em revisão cuja data ainda está longe" sem
 * perder uma das duas informações.
 */
export const DocumentLifecycleState = {
  CURRENT: 'current',
  IN_REVIEW: 'in_review',
  OBSOLETE: 'obsolete',
} as const;

export type DocumentLifecycleState =
  (typeof DocumentLifecycleState)[keyof typeof DocumentLifecycleState];

export const DOCUMENT_LIFECYCLE_STATES: readonly DocumentLifecycleState[] =
  Object.values(DocumentLifecycleState);

/**
 * Situação **apurada no momento da consulta** (US 10.4, design.md D2). Nunca
 * é gravada em coluna nem depende de rotina programada: é expressão SQL
 * avaliada pelo relógio do banco a cada `SELECT`. A SPA apresenta o valor que
 * o servidor devolveu — jamais o recalcula pelo relógio do dispositivo.
 */
export const DocumentStatus = {
  /** Data de próxima revisão a mais de `REVIEW_DUE_SOON_DAYS` dias. */
  CURRENT: 'current',
  /** Dentro da janela de `REVIEW_DUE_SOON_DAYS` dias; acompanha `daysUntilReview`. */
  DUE_SOON: 'due_soon',
  /** Declarado em revisão — prevalece sobre a data. */
  IN_REVIEW: 'in_review',
  /** Data de próxima revisão já passou. */
  OVERDUE: 'overdue',
  /** Declarado obsoleto — sai de circulação para quem não é gestão da unidade. */
  OBSOLETE: 'obsolete',
  /**
   * Sem data de próxima revisão informada. Estado que o guia do cliente não
   * prevê e que esta change inaugura: é a consequência direta de dispensar
   * metadados no lote (design.md D7) — o acervo já existente e tudo que entra
   * por lote cai aqui. Não conta entre os documentos a vencer nem entre os
   * vencidos.
   */
  UNCONTROLLED: 'uncontrolled',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** Janela de "A vencer", em dias (US 10.4 cenário 2). */
export const REVIEW_DUE_SOON_DAYS = 60;

/** Campos de controle como aparecem na leitura de um documento. */
export interface DocumentControlFields {
  documentType: DocumentType | null;
  documentCode: string | null;
  /** Inteiro; apresentado formatado (`Rev. 02`) pela interface — design.md D8. */
  documentRevision: number | null;
  responsibleSector: string | null;
  /** Data (`YYYY-MM-DD`), sem hora: o prazo é do dia, não do instante. */
  nextReviewAt: string | null;
  /** `null` = vigente, não declarado. */
  lifecycleState: DocumentLifecycleState | null;
  /** Derivada no `SELECT` pelo relógio do banco (design.md D2). */
  documentStatus: DocumentStatus;
  /** Dias até a próxima revisão; negativo quando vencida, `null` sem data. */
  daysUntilReview: number | null;
  /**
   * Veredito do verbo exigido para editar os dados de controle (o mesmo de
   * substituir), **resolvido pelo servidor** — mesmo padrão e mesma razão de
   * `FolderContentsResponse.canUpload`: a capability `web-navegacao` proíbe a
   * SPA de inferir permissão no cliente, e quem tem a concessão sobre
   * documento de outra pessoa não é derivável do DTO.
   *
   * Presente apenas nas respostas que **listam** documentos (listagem de
   * pasta e busca), onde o fragmento de alcance já está em mãos e sai de
   * graça na mesma consulta; ausente nas respostas de uma operação sobre um
   * documento só, que não são usadas para decidir o que oferecer. Ausência é
   * tratada como "não oferecer" pela interface.
   *
   * Não é linha de defesa: o 403 de `PATCH /files/:id/document-control`
   * continua sendo a autorização real.
   */
  canEditControl?: boolean;
}

/**
 * Dados de controle informados pelo cliente, no envio de um documento
 * (`POST /files/upload-url`) e na edição (`PATCH /files/:id/document-control`).
 *
 * `nextReviewAt` é `YYYY-MM-DD`. `lifecycleState` ausente mantém o estado
 * atual na edição e significa "vigente, não declarado" na publicação.
 */
export interface DocumentControlInput {
  documentType?: DocumentType | null;
  documentCode?: string | null;
  documentRevision?: number | null;
  responsibleSector?: string | null;
  nextReviewAt?: string | null;
  lifecycleState?: DocumentLifecycleState | null;
}

/** `PATCH /files/:id/document-control` (US 10.5) — sem reenvio de conteúdo. */
export type UpdateDocumentControlRequest = DocumentControlInput;

/**
 * Recusa por dado de controle faltante no envio de **um** documento
 * (US 10.5 cenário 1). `missing` nomeia os campos que faltam, para a
 * interface apontar o que corrigir em vez de exibir uma recusa genérica —
 * distinguível da recusa por código em uso e da recusa por permissão.
 */
export interface DocumentControlRequiredResponse {
  error: 'document_control_required';
  missing: (keyof DocumentControlInput)[];
}

/**
 * Recusa por código já usado por documento **não excluído da mesma unidade**
 * (US 10.2 cenário 2; design.md D5). `occupiedBy` só é preenchido na recusa de
 * **restauração**, onde o design exige dizer qual documento ocupa o código
 * para a pessoa poder resolver; nunca atravessa unidade — o mesmo código em
 * outra unidade não conflita e nada dele é revelado.
 */
export interface DocumentCodeInUseResponse {
  error: 'document_code_in_use';
  code: string;
  occupiedBy?: { id: string; fileName: string };
}

/** Recusa por tipo documental fora do conjunto previsto (US 10.1). */
export interface InvalidDocumentTypeResponse {
  error: 'invalid_document_type';
}
