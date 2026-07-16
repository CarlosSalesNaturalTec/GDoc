import express, { type Express, type ErrorRequestHandler } from 'express';
import type { Ports } from './ports/index.js';
import { healthRouter } from './routes/health.js';
import { filesRouter } from './routes/files.js';
import { storageEventsRouter } from './routes/storage-events.js';
import { attachTenantContext } from './middleware/tenant-context.js';

export function createApp(ports: Ports): Express {
  const app = express();
  app.use(express.json());

  app.use(healthRouter(ports));
  app.use(storageEventsRouter(ports));
  app.use(attachTenantContext(ports), filesRouter(ports));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(errorHandler);

  return app;
}
