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
  [DocumentType.GENERAL_FILE]: 'Arquivo geral',
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
  /**
   * O material do cliente não dá sigla ao Arquivo geral — ele é a opção que
   * declara ausência de controle, e não um tipo da Matriz. `ARQ` existe porque
   * a listagem apresenta o tipo como sigla textual em toda linha, e deixá-la
   * vazia faria o Arquivo geral parecer arquivo **sem** tipo, que é
   * precisamente a condição da qual ele precisa se distinguir.
   */
  [DocumentType.GENERAL_FILE]: 'ARQ',
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
  /** Pede ação de quem enviou — alerta, não falha. */
  [DocumentStatus.AWAITING_REGISTRATION]: 'alerta',
  /** Nunca renderizado: o Arquivo geral não apresenta etiqueta de situação. */
  [DocumentStatus.NOT_APPLICABLE]: 'neutro',
} as const;

/**
 * Texto da situação **apurada pelo servidor**, ou `null` quando não há
 * situação a apresentar. A SPA nunca recalcula a situação a partir da data e
 * do relógio do dispositivo (web-navegacao: "A SPA SHALL apresentar a que o
 * servidor devolveu") — aqui só se traduz o veredito recebido. A única
 * aritmética é a de "vence em N dias", e N também vem do servidor
 * (`daysUntilReview`).
 *
 * `null` devolve-se em dois casos, e quem chama decide o que renderizar
 * (ausência explícita, nunca etiqueta vazia):
 *
 * - **Arquivo geral**, que declara não ter prazo (US 10.8) — a demanda é
 *   explícita em que ele "não tem situação (Vigente, A vencer etc.)";
 * - **valor desconhecido**, de um servidor mais novo que esta SPA. Antes, o
 *   `default` deste `switch` respondia "Sem controle de revisão" a qualquer
 *   valor não previsto, o que é uma **afirmação** sobre o documento, não um
 *   fallback neutro — e foi o que teria apresentado o pendente de cadastro
 *   como acervo em circulação.
 */
export function rotuloDeSituacao(file: FileSummaryResponse): string | null {
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
    case DocumentStatus.AWAITING_REGISTRATION:
      return 'Pendente de cadastro';
    case DocumentStatus.UNCONTROLLED:
      return 'Sem controle de revisão';
    default:
      return null;
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
