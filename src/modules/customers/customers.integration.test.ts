import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requestAsAdmin } from '../../test-utils/auth.js';

/** Cliente seed `api-spec/seeds.json` (Juan Pérez). */
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('Clientes — visitas (integración)', () => {
  it('crea, actualiza y filtra visitas por tipo', async () => {
    const descripcion = 'Nota de prueba\n  con espacios y segunda línea.';
    const fechaIso = new Date().toISOString();

    const postRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion, fecha: fechaIso }),
      }
    );
    const postText = await postRes.text();
    assert.equal(postRes.status, 201, postText);
    const created = JSON.parse(postText) as {
      id: string;
      customerId: string;
      descripcion: string;
      tipo: string;
      usuario: { nombre: string; username: string };
    };
    assert.equal(created.customerId, CUSTOMER_ID);
    assert.equal(created.descripcion, descripcion);
    assert.equal(created.tipo, 'otro');
    assert.ok(created.id);
    assert.ok(created.usuario?.username);

    const patchRes = await requestAsAdmin(
      '/api/customers/' + CUSTOMER_ID + '/visits/' + created.id,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'compra' }),
      }
    );
    const patchText = await patchRes.text();
    assert.equal(patchRes.status, 200, patchText);
    assert.equal(JSON.parse(patchText).tipo, 'compra');

    const listRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits?page=1&limit=10&tipo=compra`
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      data: Array<{ id: string; descripcion: string; tipo: string }>;
      pagination: { total: number };
    };
    assert.ok(Array.isArray(listJson.data));
    assert.ok(listJson.pagination.total >= 1);
    assert.ok(listJson.data.every((v) => v.tipo === 'compra'));
    const found = listJson.data.find((v) => v.id === created.id);
    assert.ok(found);
    assert.equal(found!.descripcion, descripcion);
  });
});
