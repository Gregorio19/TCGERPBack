import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import app from '../../app.js';
import { generateToken } from '../../lib/auth.js';

it('indicadores exige autenticación y usa caché con datos del proveedor', async (t) => {
  const path = '/api/indicadores';
  assert.equal((await app.request(path)).status, 401);
  const authorization = `Bearer ${generateToken({ userId: randomUUID(), username: 'test', role: 'test' })}`;
  const request = () => app.request(path, { headers: { Authorization: authorization } });

  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 500 }));
  const unavailable = await request();
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.text()), /Indicadores económicos no disponibles/);

  const fecha = '2026-11-22T12:00:00.000Z';
  fetch.mock.mockImplementation(async (url, init) => {
    assert.equal(url, 'https://mindicador.cl/api');
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json({ fecha, uf: { valor: 39850.25 }, utm: { valor: 69000 }, dolar: { valor: 955.5 } });
  });
  const current = await request();
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), { fecha, uf: 39850.25, utm: 69000, dolar: 955.5 });

  const cached = await request();
  assert.equal(cached.status, 200);
  assert.equal(fetch.mock.callCount(), 2);
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 6 * 60 * 60 * 1000 + 1);
  fetch.mock.mockImplementation(async () => { throw new Error('Proveedor sin conexión'); });
  const stale = await request();
  assert.equal(stale.status, 200);
  assert.deepEqual(await stale.json(), { fecha, uf: 39850.25, utm: 69000, dolar: 955.5 });
  assert.equal(fetch.mock.callCount(), 3);
});
