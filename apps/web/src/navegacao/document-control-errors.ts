import type { DocumentControlInput } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';

/**
 * Recusas do controle documental, traduzidas em avisos **distinguíveis entre
 * si** (web-upload: "apresentada de forma distinguível, indicando o que
 * corrigir"; web-navegacao: a recusa por código em uso não se confunde com a
 * recusa por dado faltante nem com a de permissão).
 *
 * Três recusas, três mensagens, e nenhuma delas é o "tente novamente"
 * genérico — repetir a mesma operação falharia de forma idêntica nos três
 * casos.
 */

const RotuloDoCampo: Record<keyof DocumentControlInput, string> = {
  documentType: 'tipo',
  documentCode: 'código',
  documentRevision: 'revisão',
  responsibleSector: 'setor responsável',
  nextReviewAt: 'data da próxima revisão',
  lifecycleState: 'situação declarada',
};

function detalhes(err: unknown): Record<string, unknown> | null {
  if (!(err instanceof ApiError)) return null;
  const details = err.details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)
    : null;
}

export function erroDeCodigoEmUso(err: unknown): boolean {
  return detalhes(err)?.error === 'document_code_in_use';
}

export function descreverRecusaDeControle(err: unknown): string {
  const details = detalhes(err);

  if (details?.error === 'document_code_in_use') {
    const ocupante = details.occupiedBy as { fileName?: string } | undefined;
    return ocupante?.fileName
      ? `Código já em uso nesta unidade por "${ocupante.fileName}". Escolha outro código.`
      : 'Código já em uso por outro documento desta unidade. Escolha outro código.';
  }

  if (details?.error === 'document_control_required') {
    const faltantes = Array.isArray(details.missing)
      ? (details.missing as (keyof DocumentControlInput)[])
          .map((campo) => RotuloDoCampo[campo] ?? campo)
          .join(', ')
      : '';
    return faltantes
      ? `Faltam dados de controle: ${faltantes}.`
      : 'Informe os dados de controle do documento.';
  }

  if (details?.error === 'invalid_document_type') {
    return 'Tipo de documento não reconhecido.';
  }

  if (err instanceof ApiError && err.status === 403) {
    return 'Permissão insuficiente para alterar os dados de controle deste documento.';
  }

  return 'Não foi possível concluir a ação. Tente novamente.';
}
