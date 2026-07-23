import { Router } from 'express';
import type { Ports } from '../ports/index.js';
import { config } from '../config.js';
import { normalizeFinalizeNotification, reconcileFinalize } from '../lib/storage-reconcile.js';
import {
  createGoogleOidcVerifier,
  extractBearerToken,
  type OidcVerifier,
} from '../lib/pubsub-oidc.js';

/**
 * Reconciliação pós-upload. Em produção, o alvo real de uma push subscription
 * do Pub/Sub disparada pela notificação de finalização de objeto do GCS (ver
 * infra/terraform/pubsub.tf): o corpo é o envelope `{ message: { data } }` com
 * o metadata do objeto em base64, e a requisição chega autenticada por um JWT
 * OIDC no header `Authorization`. Em dev, sem Pub/Sub, o mesmo endpoint é
 * chamado diretamente (pela prova E2E ou manualmente) com o payload simplificado
 * `{ objectPath, sizeBytes }` e sem token — a validação OIDC fica desligada por
 * config (paridade dev↔prod).
 *
 * `verifyOidc` e `validationEnabled` são injetáveis para os testes; em produção
 * usam o verificador do google-auth-library e a flag de `config`, por padrão.
 */
export interface StorageEventsOptions {
  verifyOidc?: OidcVerifier;
  validationEnabled?: boolean;
}

export function storageEventsRouter(ports: Ports, options: StorageEventsOptions = {}): Router {
  const verifyOidc = options.verifyOidc ?? createGoogleOidcVerifier();
  const validationEnabled = options.validationEnabled ?? config.pubsubOidc.validationEnabled;
  const router = Router();

  router.post('/internal/storage-events', async (req, res, next) => {
    try {
      // Autenticação da notificação (design.md D2). Fail-closed: sem token
      // válido → 401, sem tocar no banco. Em dev a validação é desligada.
      if (validationEnabled) {
        const token = extractBearerToken(req.header('authorization'));
        if (!token || !(await verifyOidc(token))) {
          res.status(401).json({ error: 'unauthenticated notification' });
          return;
        }
      }

      const notification = normalizeFinalizeNotification(req.body);
      if (!notification) {
        res.status(400).json({ error: 'invalid notification payload' });
        return;
      }

      const result = await reconcileFinalize(ports, notification);

      // Objeto desconhecido (evento duplicado tardio ou objeto já reconciliado):
      // responde 2xx (ack) para drenar a mensagem em vez de deixar o Pub/Sub
      // re-tentar em loop uma notificação que nunca vai casar (design.md D3).
      if (!result.found) {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      res.json({ status: result.overQuota ? 'over_quota' : 'active' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
