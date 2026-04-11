import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';

/** Cliente seed `api-spec/seeds.json` (Juan Pérez). */
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('Clientes — visitas (integración)', () => {
  it('POST visita y GET listado con token admin', async () => {
    const loginRes = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200, 'login seed admin/password123');
    const { token } = (await loginRes.json()) as { token: string };

    const descripcion = 'Nota de prueba\n  con espacios y segunda línea.';
    const fechaIso = '2026-04-01T14:30:00.000Z';

    const postRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/visits`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ descripcion, fecha: fechaIso }),
      }
    );
    const postText = await postRes.text();
    assert.equal(postRes.status, 201, postText);
    const created = JSON.parse(postText) as {
      id: string;
      customerId: string;
      descripcion: string;
      usuario: { nombre: string; username: string };
    };
    assert.equal(created.customerId, CUSTOMER_ID);
    assert.equal(created.descripcion, descripcion);
    assert.ok(created.id);
    assert.ok(created.usuario?.username);

    const listRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/visits?page=1&limit=10`
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      data: Array<{ id: string; descripcion: string }>;
      pagination: { total: number };
    };
    assert.ok(Array.isArray(listJson.data));
    assert.ok(listJson.pagination.total >= 1);
    const found = listJson.data.find((v) => v.id === created.id);
    assert.ok(found);
    assert.equal(found!.descripcion, descripcion);
  });
});
