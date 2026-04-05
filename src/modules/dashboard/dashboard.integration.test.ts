import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';

describe('Dashboard API (integración)', () => {
  it('login + GET /dashboard/stats + GET /charts/monthly-sales', async () => {
    const loginRes = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200);
    const { token } = (await loginRes.json()) as { token: string };
    assert.ok(token);

    const statsRes = await app.request('http://localhost/api/dashboard/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(statsRes.status, 200);
    const stats = (await statsRes.json()) as Record<string, unknown>;
    assert.equal(typeof stats.totalProductos, 'number');
    assert.equal(typeof stats.totalStock, 'number');
    assert.equal(typeof stats.ventasMensuales, 'number');
    assert.equal(typeof stats.carritosActivos, 'number');
    assert.equal(stats.carritosActivos, 0);
    assert.equal(typeof stats.productosBajoStock, 'number');
    assert.equal(typeof stats.totalClientes, 'number');
    assert.equal(typeof stats.totalPedidos, 'number');
    assert.ok(Array.isArray(stats.topCategorias));
    assert.ok(Array.isArray(stats.ventasRecientes));
    assert.ok(Array.isArray(stats.productosPopulares));

    const chartRes = await app.request('http://localhost/api/charts/monthly-sales', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(chartRes.status, 200);
    const monthly = (await chartRes.json()) as unknown;
    assert.ok(Array.isArray(monthly));
    assert.equal((monthly as unknown[]).length, 12);
    const row = (monthly as { mes: string; ventas: number; productos: number; clientes: number }[])[0];
    assert.ok(typeof row.mes === 'string');
    assert.ok(typeof row.ventas === 'number');
  });
});
