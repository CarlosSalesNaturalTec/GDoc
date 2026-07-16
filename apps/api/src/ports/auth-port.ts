/**
 * AuthPort — esqueleto de hash/verificação de senha (argon2). Sem telas,
 * CRUD de pessoas ou sessão/login: isso é Épico 1, fora do escopo desta
 * mudança de fundação.
 */
export interface AuthPort {
  hashPassword(plainTextPassword: string): Promise<string>;
  verifyPassword(hash: string, plainTextPassword: string): Promise<boolean>;
}
