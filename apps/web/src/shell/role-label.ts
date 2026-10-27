import { UserRole } from '@gdoc/shared';

/**
 * Origem única do rótulo de papel de acesso (capability
 * `nomenclatura-interface`, requisito "Rótulo do papel é idêntico em toda a
 * interface"; change `identidade-visual-isetes`, design.md D7).
 *
 * Antes desta change o mapa estava **triplicado** — shell, perfil da própria
 * conta e cadastro de colaboradores tinham cópias independentes. Trocar o
 * rótulo de `unit_admin` para "Gestor" em três lugares é exatamente o tipo de
 * mudança em que um deles fica para trás, e por isso o requisito proíbe a
 * divergência em vez de confiar na disciplina de quem edita.
 *
 * "Gestor" é decisão de nomenclatura do cliente: muda o **texto exibido**,
 * nunca o papel. O identificador interno (`unit_admin`), o esquema do banco e
 * os contratos de API permanecem inalterados.
 */
export const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.COLLABORATOR]: 'Colaborador',
  [UserRole.UNIT_ADMIN]: 'Gestor',
  [UserRole.GLOBAL_ADMIN]: 'Administrador global',
};
