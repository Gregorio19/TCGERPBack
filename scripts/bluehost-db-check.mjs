#!/usr/bin/env node
/**
 * Verifica conexión a PostgreSQL (Bluehost) y extensión btree_gist.
 * Requiere DATABASE_URL en el entorno.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." npm run bluehost-db-check
 */

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  const version = await client.query('SELECT version()');
  console.log('PostgreSQL:', version.rows[0]?.version?.slice(0, 80) + '...');

  const dbName = await client.query('SELECT current_database()');
  console.log('Base actual:', dbName.rows[0]?.current_database);

  const ext = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS ok"
  );
  const hasBtreeGist = ext.rows[0]?.ok === true;
  console.log('Extensión btree_gist:', hasBtreeGist ? 'OK' : 'FALTA — ejecutar CREATE EXTENSION en phpPgAdmin');

  if (!hasBtreeGist) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
      console.log('btree_gist creada correctamente.');
    } catch (e) {
      console.error('No se pudo crear btree_gist:', e.message);
      console.error('Solicita activación a soporte Bluehost.');
      process.exit(1);
    }
  }

  await client.end();
  console.log('Conexión OK.');
}

main().catch((e) => {
  console.error('Error de conexión:', e.message);
  process.exit(1);
});
