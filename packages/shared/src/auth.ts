import type { UserRole } from './roles.js';

export interface LoginRequest {
  email: string;
  password: string;
}

/** Identidade da sessão corrente — devolvida por login e por `GET /auth/me`. */
export interface AuthenticatedIdentity {
  id: string;
  unitId: string;
  role: UserRole;
}
