import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { Argon2AuthPort } from '../adapters/argon2-auth-port.js';
import type { SecretsPort } from '../ports/secrets-port.js';

class FixedSecretsPort implements SecretsPort {
  constructor(private readonly value: string) {}
  async getSecret(): Promise<string> {
    return this.value;
  }
}

describe('Argon2AuthPort — sessão (JWT HMAC-SHA256)', () => {
  it('emite e verifica um token válido', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), 60);
    const issuedAt = new Date();
    const token = await auth.issueSession({ sub: 'user-1' }, issuedAt);
    const claims = await auth.verifySession(token);
    expect(claims).toEqual({ sub: 'user-1', iat: Math.floor(issuedAt.getTime() / 1000) });
  });

  it('usa o relógio do Node quando nenhum instante de emissão é informado', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), 60);
    const before = Math.floor(Date.now() / 1000);
    const token = await auth.issueSession({ sub: 'user-1' });
    const claims = await auth.verifySession(token);
    expect(claims!.iat).toBeGreaterThanOrEqual(before);
  });

  it('rejeita token sem instante de emissão (fail-closed)', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), 60);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf-8').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 9999999999 }), 'utf-8').toString('base64url');
    const signature = createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url');
    const tokenWithoutIat = `${header}.${payload}.${signature}`;
    expect(await auth.verifySession(tokenWithoutIat)).toBeNull();
  });

  it('rejeita token adulterado', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), 60);
    const token = await auth.issueSession({ sub: 'user-1' });
    const [header, payload] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', iat: 0, exp: 9999999999 }),
      'utf-8',
    ).toString('base64url');
    const tampered = `${header}.${tamperedPayload}.forged-signature`;
    expect(await auth.verifySession(tampered)).toBeNull();
    void payload;
  });

  it('rejeita token expirado', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), -1);
    const token = await auth.issueSession({ sub: 'user-1' });
    expect(await auth.verifySession(token)).toBeNull();
  });

  it('rejeita token assinado com outro segredo', async () => {
    const issuer = new Argon2AuthPort(new FixedSecretsPort('secret-a'), 60);
    const verifier = new Argon2AuthPort(new FixedSecretsPort('secret-b'), 60);
    const token = await issuer.issueSession({ sub: 'user-1' });
    expect(await verifier.verifySession(token)).toBeNull();
  });

  it('rejeita string que não tem o formato de token', async () => {
    const auth = new Argon2AuthPort(new FixedSecretsPort('test-secret'), 60);
    expect(await auth.verifySession('not-a-token')).toBeNull();
  });
});
