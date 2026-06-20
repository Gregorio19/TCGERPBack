#!/usr/bin/env node
/**
 * Une todas las migraciones Prisma en un solo .sql para phpPgAdmin (sin prisma CLI en servidor).
 *
 * Uso: node scripts/bluehost-migrations-sql.mjs > bluehost-migrations.sql
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationsDir = join(root, 'prisma/migrations');
const outFile = join(root, 'bluehost-migrations.sql');

const dirs = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const parts = [
  '-- Ejecutar en phpPgAdmin → BD pandigee_tcgerp',
  '-- Antes: CREATE EXTENSION IF NOT EXISTS btree_gist;',
  '',
  'CREATE EXTENSION IF NOT EXISTS btree_gist;',
  '',
];

for (const dir of dirs) {
  const sqlPath = join(migrationsDir, dir, 'migration.sql');
  try {
    const sql = await readFile(sqlPath, 'utf8');
    parts.push(`-- === ${dir} ===`, sql.trim(), '');
  } catch {
    console.error(`Omitido (sin migration.sql): ${dir}`);
  }
}

const content = parts.join('\n');
await writeFile(outFile, content, 'utf8');
console.log(`Escrito: ${outFile} (${dirs.length} migraciones)`);
