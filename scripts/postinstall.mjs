#!/usr/bin/env node
/**
 * postinstall: prisma generate salvo en Bluehost (memoria insuficiente para WASM).
 * En cPanel añade variable: SKIP_PRISMA_GENERATE=1
 */
import { execSync } from 'node:child_process';

if (process.env.SKIP_PRISMA_GENERATE === '1') {
  console.log('[postinstall] SKIP_PRISMA_GENERATE=1 — omitiendo prisma generate');
  process.exit(0);
}

execSync('npx prisma generate', { stdio: 'inherit' });
