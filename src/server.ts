import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const port = env.PORT;

logger.info(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: process.env.HOST, // en MegaCloud HOST=127.0.0.1 (detrás de Nginx)
}, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
});

