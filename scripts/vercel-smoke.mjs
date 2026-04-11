#!/usr/bin/env node
/**
 * Smoke test post-deploy (o local): health, login, GET autenticado, POST autenticado.
 *
 * Uso:
 *   SMOKE_BASE_URL=https://tu-app.vercel.app npm run vercel-smoke
 *   npm run vercel-smoke   # default http://localhost:3001
 */

const base = (process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const adminUser = process.env.SMOKE_ADMIN_USER || 'admin';
const adminPass = process.env.SMOKE_ADMIN_PASSWORD || 'password123';
const customerId =
  process.env.SMOKE_CUSTOMER_ID || '550e8400-e29b-41d4-a716-446655440001';

function fail(msg, res, body) {
  console.error(msg);
  if (res) console.error('Status:', res.status, res.statusText);
  if (body !== undefined) console.error('Body:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  process.exit(1);
}

async function main() {
  console.log('SMOKE_BASE_URL =', base);

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
    fail('POST /api/auth/login debe responder 200', loginRes, loginText);
  }
  let token;
  try {
    token = JSON.parse(loginText).token;
  } catch {
    fail('Login: JSON inválido', loginRes, loginText);
  }
  if (!token) {
    fail('Login: falta token en respuesta', loginRes, loginText);
  }
  console.log('OK POST /api/auth/login');

  const productsRes = await fetch(`${base}/api/products?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const productsText = await productsRes.text();
  if (!productsRes.ok) {
    fail('GET /api/products?limit=1 debe responder 200 (o revisar permisos del rol admin)', productsRes, productsText);
  }
  console.log('OK GET /api/products (con Bearer)');

  const visitBody = {
    descripcion: `vercel-smoke ${new Date().toISOString()}`,
  };
  const visitRes = await fetch(`${base}/api/customers/${customerId}/visits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(visitBody),
  });
  const visitText = await visitRes.text();
  if (!visitRes.ok) {
    fail(
      'POST /api/customers/:id/visits debe responder 201 (cliente seed y permiso customers.create)',
      visitRes,
      visitText
    );
  }
  let visitJson;
  try {
    visitJson = JSON.parse(visitText);
  } catch {
    fail('Visita: JSON inválido', visitRes, visitText);
  }
  if (!visitJson.id || visitJson.descripcion !== visitBody.descripcion) {
    fail('Visita: respuesta inesperada', visitRes, visitJson);
  }
  console.log('OK POST /api/customers/:id/visits');

  console.log('\nSmoke test completado correctamente.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
