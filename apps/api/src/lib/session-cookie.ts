import type { CookieOptions } from 'express';
import { config } from '../config.js';

export const SESSION_COOKIE_NAME = 'gdoc_session';

/**
 * Atributos do cookie de sessão: `HttpOnly` (imune a exfiltração via XSS),
 * `Secure` fora de dev (Cloud Run/produção é sempre https), `SameSite=Strict`
 * (ver design.md Decisão D1). `maxAge` é passado à parte por quem seta o
 * cookie (login) — logout usa os mesmos atributos sem `maxAge` para limpar.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  };
}
