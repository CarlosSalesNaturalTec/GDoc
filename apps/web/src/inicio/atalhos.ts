import { UserRole } from '@gdoc/shared';

/**
 * Atalhos da tela inicial (US 11.1, cenário 2), com o papel que cada um
 * exige.
 *
 * `roles` é a **mesma** condição que a guarda de rota do `router.tsx` aplica
 * ao destino — é isso que faz valer "atalho apresentado conduz a uma ação
 * executável, sem recusa por permissão". Um atalho sem `roles` é alcançável
 * por qualquer papel autenticado.
 *
 * A filtragem aqui é de **apresentação**, nunca linha de defesa: a API segue
 * sendo o único guardião de permissão, e a guarda de rota recusa o acesso
 * direto por URL de quem não pode.
 */
export interface Atalho {
  chave: string;
  rotulo: string;
  descricao: string;
  destino: string;
  /** Ausente = qualquer papel autenticado. */
  roles?: readonly UserRole[];
}

const ADMINS = [UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN] as const;

export const ATALHOS: readonly Atalho[] = [
  {
    chave: 'enviar',
    rotulo: 'Enviar documentos',
    descricao: 'Publicar arquivos ou uma pasta inteira.',
    destino: '/pastas',
  },
  {
    chave: 'documentos',
    rotulo: 'Ver documentos',
    descricao: 'Navegar pelas pastas da sua unidade.',
    destino: '/pastas',
  },
  {
    chave: 'lixeira',
    rotulo: 'Lixeira',
    descricao: 'Recuperar o que foi excluído por engano.',
    destino: '/lixeira',
  },
  {
    chave: 'pessoas',
    rotulo: 'Colaboradores',
    descricao: 'Cadastrar contas e redefinir senhas.',
    destino: '/admin/pessoas',
    roles: ADMINS,
  },
  {
    chave: 'painel',
    rotulo: 'Painel',
    descricao: 'Acompanhar uso e documentos da unidade.',
    destino: '/admin/painel',
    roles: ADMINS,
  },
  {
    chave: 'unidades',
    rotulo: 'Unidades',
    descricao: 'Criar e administrar unidades.',
    destino: '/admin/unidades',
    roles: [UserRole.GLOBAL_ADMIN],
  },
];

export function atalhosDoPapel(role: UserRole): Atalho[] {
  return ATALHOS.filter((atalho) => !atalho.roles || atalho.roles.includes(role));
}
