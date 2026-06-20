#!/usr/bin/env node
/**
 * Prueba mínima sin Prisma/BD. Si /health responde OK, el problema está en la app principal.
 * cPanel → startup file: bluehost-ping.mjs → REINICIAR → probar /health
 */
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';

const logPath = './tmp/startup.log';
try {
  mkdirSync('./tmp', { recursive: true });
} catch {
  /* ok */
}

function log(msg) {
  const line = `[ping] ${new Date().toISOString()} ${msg}\n`;
  try {
    appendFileSync(logPath, line);
  } catch {
    /* ok */
  }
  console.log(line.trim());
}

const port = Number(process.env.PORT) || 3001;
log(`PORT=${port} NODE_ENV=${process.env.NODE_ENV || ''}`);

createServer((req, res) => {
  if (req.url === '/health' || req.url?.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mode: 'bluehost-ping' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(port, () => {
  log(`listening on ${port}`);
});
