#!/usr/bin/env node
/**
 * Smoke test post-deploy Bluehost.
 *
 * Uso:
 *   BLUEHOST_API_URL=https://apierp.pandigeektcg.cl npm run bluehost-smoke
 */

const base = (process.env.BLUEHOST_API_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(
  /\/$/,
  ''
);
const adminUser = process.env.SMOKE_ADMIN_USER || 'admin';
const adminPass = process.env.SMOKE_ADMIN_PASSWORD || 'password123';

function fail(msg, res, body) {
  console.error(msg);
  if (res) console.error('Status:', res.status, res.statusText);
  if (body !== undefined) {
    console.error('Body:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  process.exit(1);
}

async function main() {
  console.log('BLUEHOST_API_URL =', base);

  const healthRes = await fetch(`${base}/health`);
  if (!healthRes.ok) {
    fail('GET /health debe responder 200', healthRes, await healthRes.text());
  }
  const healthJson = await healthRes.json();
  if (healthJson.status !== 'ok') {
    fail('GET /health: body.status !== ok', healthRes, healthJson);
  }
  console.log('OK GET /health');

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass }),
  });
  const loginText = await loginRes.text();
  if (!loginRes.ok) {
    fail(
      'POST /api/auth/login debe responder 200 (ejecuta db:seed si la BD está vacía)',
      loginRes,
      loginText
    );
  }
  let token;
  try {
    token = JSON.parse(loginText).token;
  } catch {
    fail('Login: JSON inválido', loginRes, loginText);
  }
  if (!token) {
    fail('Login: falta token', loginRes, loginText);
  }
  console.log('OK POST /api/auth/login');

  const productsRes = await fetch(`${base}/api/products?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!productsRes.ok) {
    fail('GET /api/products debe responder 200', productsRes, await productsRes.text());
  }
  console.log('OK GET /api/products');

  console.log('\nBluehost smoke test completado.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
