import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

/**
 * Verifica o Bearer token OIDC do push do Pub/Sub. Resolve `true` se o token
 * é válido para esta API, `false` caso contrário. Fail-closed: qualquer erro
 * (assinatura inválida, aud errada, token expirado, JWKS indisponível) → `false`.
 */
export type OidcVerifier = (bearerToken: string) => Promise<boolean>;

// Client compartilhado: cacheia as chaves públicas do Google (JWKS)
// internamente, então a validação é local após o primeiro fetch (design.md,
// "JWKS/latência de validação OIDC").
let sharedClient: OAuth2Client | undefined;

/**
 * Verificador OIDC padrão (produção), baseado no google-auth-library. Valida a
 * assinatura pelas chaves do Google, o `aud` esperado (a URL do push_endpoint,
 * vinda de `config.pubsubOidc.expectedAudience`) e, se configurado, o `email`
 * verificado da SA emissora (`${name_prefix}-pubsub-push`).
 */
export function createGoogleOidcVerifier(): OidcVerifier {
  return async (token: string): Promise<boolean> => {
    const audience = config.pubsubOidc.expectedAudience;
    if (!audience) {
      // Validação ligada sem audience é misconfiguração — fail-closed em vez
      // de aceitar qualquer token (design.md, risco "audience divergente").
      console.error(
        'PUBSUB_OIDC_VALIDATION ligado mas PUBSUB_PUSH_AUDIENCE não definido — recusando push',
      );
      return false;
    }
    sharedClient ??= new OAuth2Client();
    try {
      const ticket = await sharedClient.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      if (!payload) return false;

      const expectedEmail = config.pubsubOidc.expectedServiceAccountEmail;
      if (expectedEmail) {
        if (payload.email !== expectedEmail) return false;
        if (payload.email_verified === false) return false;
      }
      return true;
    } catch {
      return false;
    }
  };
}

/** Extrai o token de `Authorization: Bearer <jwt>` (ou `undefined` se ausente/malformado). */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return undefined;
  return token;
}
