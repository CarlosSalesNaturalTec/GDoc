import * as argon2 from 'argon2';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthPort, SessionClaims } from '../ports/auth-port.js';
import type { SecretsPort } from '../ports/secrets-port.js';
import { config } from '../config.js';

const SESSION_SECRET_NAME = 'AUTH_SESSION_SECRET';

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Argon2AuthPort — hash/verificação de senha (argon2) e sessão (JWT
 * HMAC-SHA256, ver design.md Decisão D1/D2). O segredo de assinatura nunca
 * é lido de `process.env` aqui: sempre via `SecretsPort`.
 */
export class Argon2AuthPort implements AuthPort {
  private cachedSecret: Promise<string> | undefined;

  constructor(
    private readonly secrets: SecretsPort,
    private readonly sessionTtlSeconds: number = config.authSessionTtlSeconds,
  ) {}

  async hashPassword(plainTextPassword: string): Promise<string> {
    return argon2.hash(plainTextPassword, {
      type: argon2.argon2id,
      memoryCost: config.authArgon2.memoryCost,
      timeCost: config.authArgon2.timeCost,
      parallelism: config.authArgon2.parallelism,
    });
  }

  async verifyPassword(hash: string, plainTextPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainTextPassword);
  }

  async issueSession(claims: SessionClaims): Promise<string> {
    const secret = await this.getSecret();
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const exp = Math.floor(Date.now() / 1000) + this.sessionTtlSeconds;
    const payload = base64UrlEncode(JSON.stringify({ sub: claims.sub, exp }));
    const signature = sign(`${header}.${payload}`, secret);
    return `${header}.${payload}.${signature}`;
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts as [string, string, string];

    const secret = await this.getSecret();
    const expectedSignature = sign(`${header}.${payload}`, secret);
    const signatureBuf = base64UrlDecode(signature);
    const expectedBuf = base64UrlDecode(expectedSignature);
    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      return null;
    }

    let parsed: { sub?: unknown; exp?: unknown };
    try {
      parsed = JSON.parse(base64UrlDecode(payload).toString('utf-8'));
    } catch {
      return null;
    }

    if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;

    return { sub: parsed.sub };
  }

  private getSecret(): Promise<string> {
    if (!this.cachedSecret) {
      this.cachedSecret = this.secrets.getSecret(SESSION_SECRET_NAME);
    }
    return this.cachedSecret;
  }
}
