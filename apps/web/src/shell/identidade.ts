import type { AuthenticatedIdentity } from '@gdoc/shared';

/**
 * Origem única da identidade **apresentada** (capability `web-shell-e-auth`,
 * requisito "Shell de layout com identidade e navegação"; change
 * `shell-e-inicio`).
 *
 * Existe porque o shell apresentava, como identidade da pessoa, os dois
 * primeiros caracteres do seu identificador interno — rótulos como "66 /
 * Colaborador". O requisito proíbe o identificador e qualquer fragmento dele
 * em todo o shell, e a regra de "o que mostrar quando não há nome" precisa
 * ser a mesma no cabeçalho e na tela inicial, senão uma das duas inventa um
 * tratamento próprio.
 */

/** Nome a apresentar, ou `null` quando a conta não tem nome cadastrado. */
export function nomeExibido(identity: AuthenticatedIdentity): string | null {
  const nome = identity.fullName.trim();
  return nome === '' ? null : nome;
}

/**
 * Iniciais do nome, para o avatar do cabeçalho — no máximo duas, do primeiro
 * e do último termo. Conta **sem** nome não tem iniciais: quem chama recorre
 * ao ícone genérico, nunca ao identificador (requisito "Conta sem nome
 * recorre a tratamento genérico").
 */
export function iniciaisDoNome(nome: string): string {
  const termos = nome.split(/\s+/).filter((t) => t.length > 0);
  if (termos.length === 0) return '';
  const primeira = termos[0]![0]!;
  const ultima = termos.length > 1 ? termos[termos.length - 1]![0]! : '';
  return `${primeira}${ultima}`.toUpperCase();
}

/**
 * Saudação da tela inicial (US 11.1, cenário 1 e 2): com o nome quando existe,
 * genérica quando não — e em nenhum dos casos com o identificador interno.
 */
export function saudacao(nome: string | null): string {
  return nome === null ? 'Olá!' : `Olá, ${nome}!`;
}
