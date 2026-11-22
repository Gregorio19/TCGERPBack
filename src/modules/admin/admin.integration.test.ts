import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../lib/db.js';
import { requestAsAdmin } from '../../test-utils/auth.js';

describe('Admin API (integración)', () => {
  it('GET /api/admin/stats devuelve KPIs y arrays esperados', async () => {
    const res = await requestAsAdmin('/api/admin/stats');
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
    const res = await requestAsAdmin('/api/admin/users?busqueda=admin&limit=5');
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
    const res = await requestAsAdmin('/api/admin/permissions');
    assert.equal(res.status, 200);
    const json = (await res.json()) as unknown;
    assert.ok(Array.isArray(json), 'catálogo sin paginar debe ser un array');
  });

  it('PUT /api/admin/roles/:id/permissions con JWT sincroniza permisos del rol', async (t) => {
    const role = await db.role.create({
      data: { nombre: 'Prueba ' + randomUUID(), descripcion: 'Rol temporal de integración' },
    });
    t.after(async () => {
      await db.role.delete({ where: { id: role.id } });
    });

    const permRes = await requestAsAdmin('/api/admin/permissions');
    assert.equal(permRes.status, 200);
    const perms = (await permRes.json()) as Array<{ id: string }>;
    const permissionIds = Array.isArray(perms) ? perms.slice(0, 2).map((p) => p.id) : [];

    const putRes = await requestAsAdmin(
      `/api/admin/roles/${role.id}/permissions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionIds }),
      }
    );
    assert.equal(putRes.status, 200);
    const body = (await putRes.json()) as { permisos: { id: string }[] };
    assert.ok(Array.isArray(body.permisos));
    assert.equal(body.permisos.length, permissionIds.length);
  });
});
