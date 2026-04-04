import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';

describe('RRHH API (integración)', () => {
  it('GET /api/hr/positions devuelve ApiResponse con data array', async () => {
    const res = await app.request('http://localhost/api/hr/positions');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: unknown;
      message?: string;
    };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
  });

  it('GET /api/hr/parametros/calculo devuelve porcentajes numéricos', async () => {
    const res = await app.request('http://localhost/api/hr/parametros/calculo');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        porcentajeAFP: number;
        porcentajeSalud: number;
        rebajaImpuesto: number;
      };
    };
    assert.equal(json.success, true);
    assert.equal(typeof json.data.porcentajeAFP, 'number');
    assert.equal(typeof json.data.rebajaImpuesto, 'number');
  });

  it('GET /api/hr/employees devuelve paginación estándar', async () => {
    const res = await app.request('http://localhost/api/hr/employees?limit=5');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: { data: unknown[]; pagination: { page: number; limit: number; total: number } };
    };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.data));
    assert.ok(json.data.pagination);
    assert.equal(typeof json.data.pagination.total, 'number');
  });
});
