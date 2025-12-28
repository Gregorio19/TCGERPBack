import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const port = env.PORT;

logger.info(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
});

