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
  workArea?: string;
  notes?: string;
}

export interface UpdatePersonRequest {
  fullName?: string;
  phone?: string;
  jobTitle?: string;
  workArea?: string;
  notes?: string;
  role?: UserRole;
  status?: PersonStatus;
}

export interface PersonResponse {
  id: string;
  unitId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  workArea: string | null;
  notes: string | null;
  role: UserRole;
  status: PersonStatus;
  createdAt: string;
}
