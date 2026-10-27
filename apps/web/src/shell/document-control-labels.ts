import {
  DocumentLifecycleState,
  DocumentStatus,
  DocumentType,
  type FileSummaryResponse,
} from '@gdoc/shared';

/**
 * Rótulos em pt_BR do controle documental (Épico 10). Vivem na SPA, como
 * `ROLE_LABEL`: o contrato compartilhado guarda os **valores** do enum, a
 * interface guarda o texto que a pessoa lê.
 */

/** Nome do tipo, como o guia do cliente o nomeia (US 10.1). */
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  [DocumentType.PROTOCOL]: 'Protocolo',
  [DocumentType.PROCEDURE]: 'Procedimento',
  [DocumentType.POLICY]: 'Política/Norma',
  [DocumentType.FORM]: 'Formulário/Checklist',
  [DocumentType.FLOWCHART]: 'Fluxograma',
  [DocumentType.MANUAL]: 'Manual',
  [DocumentType.CONSENT_TERM]: 'Termo de Consentimento',
  [DocumentType.INTERNAL_NOTICE]: 'Comunicado Interno',
};

/**
 * Sigla do tipo (US 10.1). É ela que carrega a informação na listagem — a cor
 * é redundância, nunca substituta (cenário 2: "a sigla permanece legível por
 * si só"). Por isso a sigla é renderizada como **texto**, sempre.
 */
export const DOCUMENT_TYPE_ACRONYM: Record<DocumentType, string> = {
  [DocumentType.PROTOCOL]: 'PRT',
  [DocumentType.PROCEDURE]: 'POP',
  [DocumentType.POLICY]: 'POL',
  [DocumentType.FORM]: 'FRM',
  [DocumentType.FLOWCHART]: 'FLX',
  [DocumentType.MANUAL]: 'MAN',
  [DocumentType.CONSENT_TERM]: 'TCO',
  [DocumentType.INTERNAL_NOTICE]: 'COM',
};

/** Estado declarado, como aparece no formulário de edição (design.md D3). */
export const DOCUMENT_LIFECYCLE_LABEL: Record<DocumentLifecycleState, string> = {
  [DocumentLifecycleState.CURRENT]: 'Vigente',
  [DocumentLifecycleState.IN_REVIEW]: 'Em revisão',
  [DocumentLifecycleState.OBSOLETE]: 'Obsoleto',
};

/** Tom semântico da situação — reusa os tons de estado já apurados. */
export const DOCUMENT_STATUS_TOM = {
  [DocumentStatus.CURRENT]: 'positivo',
  [DocumentStatus.DUE_SOON]: 'alerta',
  [DocumentStatus.IN_REVIEW]: 'alerta',
  [DocumentStatus.OVERDUE]: 'negativo',
  [DocumentStatus.OBSOLETE]: 'neutro',
  [DocumentStatus.UNCONTROLLED]: 'neutro',
} as const;

/**
 * Texto da situação **apurada pelo servidor**. A SPA nunca recalcula a
 * situação a partir da data e do relógio do dispositivo (web-navegacao: "A
 * SPA SHALL apresentar a que o servidor devolveu") — aqui só se traduz o
 * veredito recebido. A única aritmética é a de "vence em N dias", e N também
 * vem do servidor (`daysUntilReview`).
 */
export function rotuloDeSituacao(file: FileSummaryResponse): string {
  switch (file.documentStatus) {
    case DocumentStatus.CURRENT:
      return 'Vigente';
    case DocumentStatus.DUE_SOON:
      return file.daysUntilReview === null
        ? 'A vencer'
        : file.daysUntilReview === 1
          ? 'Vence em 1 dia'
          : `Vence em ${file.daysUntilReview} dias`;
    case DocumentStatus.IN_REVIEW:
      return 'Em revisão';
    case DocumentStatus.OVERDUE:
      return 'Revisão vencida';
    case DocumentStatus.OBSOLETE:
      return 'Obsoleto';
    default:
      return 'Sem controle de revisão';
  }
}

/** Marca de ausência explícita — nunca um valor presumido (US 10.3 cenário 2). */
export const AUSENTE = '—';

/** `Rev. 02` a partir do inteiro guardado (design.md D8); ausência explícita se não houver. */
export function formatarRevisao(revision: number | null): string {
  if (revision === null) return AUSENTE;
  return `Rev. ${String(revision).padStart(2, '0')}`;
}

/** Data `YYYY-MM-DD` em pt-BR, sem passar por fuso: o prazo é do dia, não do instante. */
export function formatarDataDeRevisao(nextReviewAt: string | null): string {
  if (!nextReviewAt) return AUSENTE;
  const [ano, mes, dia] = nextReviewAt.split('-');
  if (!ano || !mes || !dia) return AUSENTE;
  return `${dia}/${mes}/${ano}`;
}
