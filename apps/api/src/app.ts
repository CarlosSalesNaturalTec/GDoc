import express, { type Express, type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import type { Ports } from './ports/index.js';
import { healthRouter } from './routes/health.js';
import { filesRouter } from './routes/files.js';
import { foldersRouter } from './routes/folders.js';
import { usersRouter } from './routes/users.js';
import { grantsRouter } from './routes/grants.js';
import { authRouter } from './routes/auth.js';
import { storageEventsRouter } from './routes/storage-events.js';
import { trashRouter } from './routes/trash.js';
import { auditRouter } from './routes/audit.js';
import { attachTenantContext } from './middleware/tenant-context.js';

export function createApp(ports: Ports): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use(healthRouter(ports));
  app.use(storageEventsRouter(ports));
  app.use(authRouter(ports));
  app.use(attachTenantContext(ports), filesRouter(ports));
  app.use(attachTenantContext(ports), foldersRouter(ports));
  app.use(attachTenantContext(ports), usersRouter(ports));
  app.use(attachTenantContext(ports), grantsRouter(ports));
  app.use(attachTenantContext(ports), trashRouter(ports));
  app.use(attachTenantContext(ports), auditRouter(ports));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(errorHandler);

  return app;
}
