import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requestAsAdmin } from '../../test-utils/auth.js';

describe('Dashboard API (integración)', () => {
  it('GET /dashboard/stats y GET /charts/monthly-sales autenticados', async () => {
    const statsRes = await requestAsAdmin('/api/dashboard/stats');
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

    const chartRes = await requestAsAdmin('/api/charts/monthly-sales');
    assert.equal(chartRes.status, 200);
    const monthly = (await chartRes.json()) as unknown;
    assert.ok(Array.isArray(monthly));
    assert.equal((monthly as unknown[]).length, 12);
    const row = (monthly as { mes: string; ventas: number; productos: number; clientes: number }[])[0];
    assert.ok(typeof row.mes === 'string');
    assert.ok(typeof row.ventas === 'number');
  });
});
