import type { UserRole } from './roles.js';

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Identidade da sessão corrente — devolvida por login e por `GET /auth/me`.
 *
 * `fullName` e `unitName` entram pela change `shell-e-inicio` (design.md D3):
 * são resolvidos na **mesma releitura por requisição** que alimenta o contexto
 * de tenant, nunca a partir do token — é isso que faz o nome alterado no
 * cadastro aparecer na requisição seguinte, sem novo login, e o que impede um
 * nome congelado numa sessão de longa duração.
 *
 * `fullName` é `string`, não `string | null` como em `MyProfileResponse`:
 * conta sem nome cadastrado devolve **vazio**, mantendo a forma da resposta
 * estável. Vazio nunca é substituído pelo identificador interno — a interface
 * recorre a um tratamento genérico (capability `web-shell-e-auth`).
 */
export interface AuthenticatedIdentity {
  id: string;
  unitId: string;
  role: UserRole;
  /** Nome da pessoa; vazio = conta sem nome cadastrado. */
  fullName: string;
  /** Nome da unidade da pessoa. */
  unitName: string;
}

/**
 * Tamanho mínimo de senha (change `troca-de-senha`, design.md D8) — única
 * fonte da regra, para a mensagem exibida na SPA e a validação da API nunca
 * divergirem. Vale no cadastro, na troca e na geração do reset; não é
 * aplicada retroativamente a senhas já armazenadas.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Corpo de `POST /auth/password` (US 1.3) — troca da própria senha. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Resposta de `POST /users/:id/password` (US 1.4) — a senha gerada trafega
 * em texto claro **exclusivamente** nesta resposta (design.md D7).
 */
export interface ResetPasswordResponse {
  generatedPassword: string;
}

/** Resposta de `GET /auth/profile` (US 1.3, cenário 5) — somente leitura. */
export interface MyProfileResponse {
  fullName: string | null;
  email: string;
  unitName: string;
  role: UserRole;
}

/**
 * Resposta de `GET /auth/public-config` (change `rebranding-doc7-setes`,
 * design.md D4; `manualUrl` acrescentado pela change
 * `acesso-ao-manual-no-shell`, design.md D3; `supportContact` pela change
 * `identidade-visual-isetes`, design.md D8) — configuração pública de
 * apresentação da implantação, anônima por natureza (a tela de login é
 * pré-autenticação). Contrato travado a uma **allowlist nominal**: os quatro
 * campos abaixo, nenhum outro valor de configuração. Acrescentar um quinto
 * campo exige modificar o requisito de `identidade-visual`, não é extensão
 * natural do contrato. Todo valor da lista é público por natureza — nenhum
 * transita pelo `SecretsPort`.
 */
export interface PublicConfigResponse {
  appName: string;
  clientName: string;
  /** Endereço do manual do usuário publicado (capability `documentacao-usuario`); vazio = sem acesso apresentado. */
  manualUrl: string;
  /**
   * Contato do suporte da implantação, exibido na tela de login a quem não
   * consegue entrar — é por este caminho que a redefinição de senha
   * efetivamente ocorre, já que não há auto-atendimento. Texto livre
   * (e-mail, ramal ou ambos), escolha da implantação. Vazio = nenhum aviso
   * de contato é exibido, sem espaço reservado.
   */
  supportContact: string;
}
