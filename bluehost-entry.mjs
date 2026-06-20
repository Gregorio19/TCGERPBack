#!/usr/bin/env node
/**
 * Arranque Bluehost con log en tmp/startup.log (ver en Administrador de archivos).
 */
import { appendFileSync, mkdirSync } from 'node:fs';

const logPath = './tmp/startup.log';

try {
  mkdirSync('./tmp', { recursive: true });
} catch {
  /* ok */
}

function log(msg) {
  const line = `[bluehost] ${new Date().toISOString()} ${msg}\n`;
  try {
    appendFileSync(logPath, line);
  } catch {
    /* ok */
  }
  console.log(line.trim());
}

try {
  log(`PORT=${process.env.PORT || ''} DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'MISSING'}`);
  log(`JWT_SECRET=${process.env.JWT_SECRET ? 'set' : 'MISSING'}`);
  log('import dist/server.js...');
  await import('./dist/server.js');
  log('server import OK');
} catch (err) {
  log(`STARTUP FAILED: ${err?.stack || err}`);
  throw err;
}
