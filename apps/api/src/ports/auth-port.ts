/**
 * AuthPort — hash/verificação de senha (argon2) e emissão/verificação da
 * sessão autenticada (Épico 1, US 1.2). O payload da sessão carrega só o
 * `sub` (userId); unidade e papel nunca são confiados do token — são
 * relidos do banco a cada requisição (ver middleware/tenant-context.ts).
 */
export interface SessionClaims {
  sub: string;
}

export interface AuthPort {
  hashPassword(plainTextPassword: string): Promise<string>;
  verifyPassword(hash: string, plainTextPassword: string): Promise<boolean>;

  /** Emite um token de sessão assinado para os claims informados. */
  issueSession(claims: SessionClaims): Promise<string>;

  /** Verifica assinatura e expiração; devolve os claims se válido, `null` caso contrário. */
  verifySession(token: string): Promise<SessionClaims | null>;
}
