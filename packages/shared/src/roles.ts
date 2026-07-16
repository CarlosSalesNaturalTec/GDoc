/** Papéis de usuário — usados no contexto RLS (`app.user_role`). */
export const UserRole = {
  COLLABORATOR: 'collaborator',
  UNIT_ADMIN: 'unit_admin',
  GLOBAL_ADMIN: 'global_admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
