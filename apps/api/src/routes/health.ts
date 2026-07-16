import { Router } from 'express';
import type { Ports } from '../ports/index.js';

export function healthRouter(ports: Ports): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const status: { status: string; db: string; storage: string } = {
      status: 'ok',
      db: 'ok',
      storage: 'ok',
    };

    try {
      await ports.database.query('SELECT 1');
    } catch {
      status.db = 'error';
      status.status = 'error';
    }

    try {
      await ports.storage.assertObjectNotPubliclyReadable('__health-check-nonexistent__');
    } catch {
      status.storage = 'error';
      status.status = 'error';
    }

    res.status(status.status === 'ok' ? 200 : 503).json(status);
  });

  return router;
}
