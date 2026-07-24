/**
 * AuthPort — hash/verificação de senha (argon2) e emissão/verificação da
 * sessão autenticada (Épico 1, US 1.2). O payload da sessão carrega `sub`
 * (userId) e `iat` (instante de emissão); unidade e papel nunca são
 * confiados do token — são relidos do banco a cada requisição (ver
 * middleware/tenant-context.ts).
 *
 * `iat` (change `troca-de-senha`, design.md D1/D3) alimenta a invalidação de
 * sessão por troca de senha: uma sessão emitida antes da última mudança de
 * senha do seu dono é recusada na revalidação por requisição. Token sem
 * `iat` é inválido (fail-closed).
 */
export interface SessionClaims {
  sub: string;
  /** Instante de emissão, em segundos desde epoch. */
  iat: number;
}

export interface AuthPort {
  hashPassword(plainTextPassword: string): Promise<string>;
  verifyPassword(hash: string, plainTextPassword: string): Promise<boolean>;

  /**
   * Emite um token de sessão assinado para o `sub` informado. `issuedAt`
   * (design.md D2) permite que a reemissão da sessão, ao trocar a própria
   * senha, use o instante gravado no banco em vez do relógio do Node —
   * evitando que a diferença entre os dois relógios derrube a própria sessão
   * que a operação deveria preservar. Padrão: `new Date()`.
   */
  issueSession(claims: Pick<SessionClaims, 'sub'>, issuedAt?: Date): Promise<string>;

  /** Verifica assinatura e expiração; devolve os claims se válido, `null` caso contrário. */
  verifySession(token: string): Promise<SessionClaims | null>;
}
