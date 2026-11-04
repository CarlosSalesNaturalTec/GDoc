import type { UserRole } from './roles.js';

/** Status de conta de pessoa — desativar preserva arquivos e auditoria, só bloqueia login. */
export const PersonStatus = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export type PersonStatus = (typeof PersonStatus)[keyof typeof PersonStatus];

export interface CreatePersonRequest {
  fullName: string;
  email: string;
  password: string;
  /** Ignorado para `unit_admin` (forçado à própria unidade); obrigatório em espírito para `global_admin`. */
  unitId?: string;
  role?: UserRole;
  phone?: string;
  jobTitle?: string;
  /**
   * Setor da pessoa, **por referência** a um setor da unidade de destino
   * (capability `setores`). Substitui o antigo `workArea`, que era texto livre:
   * o cliente confirmou que são o mesmo conceito e que setor passará a escolher
   * o público da leitura obrigatória (`docs/respostas_a1_funcao_e_setor.txt`,
   * respostas 5a e 6a). Opcional — "sem setor" é estado válido. Setor de outra
   * unidade recusa o cadastro fail-closed, indistinguível de inexistente.
   */
  sectorId?: string;
  notes?: string;
}

export interface UpdatePersonRequest {
  fullName?: string;
  phone?: string;
  jobTitle?: string;
  /**
   * Três intenções distintas, pelo mesmo critério de `storageQuotaBytes`:
   *
   * - campo **ausente** (`undefined`) → preserva o vínculo vigente;
   * - `null` → remove o vínculo, deixando a pessoa sem setor;
   * - id → vincula ao setor, que precisa ser da **unidade da pessoa editada**.
   *
   * Setor de outra unidade recusa a requisição **inteira** (fail-closed): nenhum
   * outro campo enviado é aplicado.
   */
  sectorId?: string | null;
  notes?: string;
  role?: UserRole;
  status?: PersonStatus;
  /**
   * Exceção nominal de cota, em **bytes** (change `cota-por-usuario`,
   * design.md D7/D8). Três intenções distintas, e a distinção é significativa:
   *
   * - campo **ausente** (`undefined`) → não mexe na cota;
   * - `null` → remove a exceção, devolvendo a pessoa ao padrão da plataforma
   *   (sem exigir que quem chama conheça o valor do padrão);
   * - inteiro ≥ 0 → define a exceção nominal. Zero é válido e significa
   *   "nenhum envio novo", coerente com design.md D5.
   *
   * Só `global_admin` pode enviá-lo: a presença do campo sem o papel recusa a
   * requisição **inteira** (design.md D3, fail-closed).
   */
  storageQuotaBytes?: number | null;
}

export interface PersonResponse {
  id: string;
  unitId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  /** Setor da pessoa, ou `null` quando não há vínculo. */
  sectorId: string | null;
  /**
   * Nome do setor, resolvido pelo servidor — nunca o identificador cru na
   * tela. `null` exatamente quando `sectorId` é `null`.
   */
  sectorName: string | null;
  notes: string | null;
  role: UserRole;
  status: PersonStatus;
  createdAt: string;
  /**
   * Volume já utilizado pela pessoa, em bytes — o mesmo contador que governa o
   * bloqueio de envio, nunca um recálculo próprio. Existe para que a
   * administração decida sobre cota vendo o consumo (design.md D5).
   */
  storageUsedBytes: number;
  /**
   * Exceção nominal de cota em bytes, ou `null` quando a pessoa segue o padrão
   * da plataforma. `null` é um estado distinto de uma exceção cujo valor
   * coincida com o padrão.
   */
  storageQuotaBytes: number | null;
}
