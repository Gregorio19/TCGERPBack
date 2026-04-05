import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';

/** Rol doctor del seed (`api-spec/seeds.json`); sin permisos por defecto (solo Admin recibe catálogo en seed). */
const ROLE_DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440083';

describe('Admin API (integración)', () => {
  it('GET /api/admin/stats devuelve KPIs y arrays esperados', async () => {
    const res = await app.request('http://localhost/api/admin/stats');
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(typeof json.totalUsuarios, 'number');
    assert.equal(typeof json.usuariosActivos, 'number');
    assert.equal(typeof json.totalRoles, 'number');
    assert.equal(typeof json.totalConfiguraciones, 'number');
    assert.ok(Array.isArray(json.ultimosUsuarios));
    assert.ok(Array.isArray(json.rolesMasUsados));
    assert.ok(Array.isArray(json.distribucionUsuariosPorSucursal));
  });

  it('GET /api/admin/users con busqueda devuelve data y pagination', async () => {
    const res = await app.request('http://localhost/api/admin/users?busqueda=admin&limit=5');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: unknown[];
      pagination: { page: number; total: number };
    };
    assert.ok(Array.isArray(json.data));
    assert.ok(json.pagination);
    assert.equal(typeof json.pagination.total, 'number');
  });

  it('GET /api/admin/permissions sin page/limit devuelve array plano', async () => {
    const res = await app.request('http://localhost/api/admin/permissions');
    assert.equal(res.status, 200);
    const json = (await res.json()) as unknown;
    assert.ok(Array.isArray(json), 'catálogo sin paginar debe ser un array');
  });

  it('PUT /api/admin/roles/:id/permissions con JWT sincroniza permisos del rol', async () => {
    const loginRes = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200, 'login seed admin/password123');
    const { token } = (await loginRes.json()) as { token: string };

    const permRes = await app.request('http://localhost/api/admin/permissions');
    assert.equal(permRes.status, 200);
    const perms = (await permRes.json()) as Array<{ id: string }>;
    const permissionIds = Array.isArray(perms) ? perms.slice(0, 2).map((p) => p.id) : [];

    const putRes = await app.request(
      `http://localhost/api/admin/roles/${ROLE_DOCTOR_ID}/permissions`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permissionIds }),
      }
    );
    assert.equal(putRes.status, 200);
    const body = (await putRes.json()) as { permisos: { id: string }[] };
    assert.ok(Array.isArray(body.permisos));
    assert.equal(body.permisos.length, permissionIds.length);
  });
});
