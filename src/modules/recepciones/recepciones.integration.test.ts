import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { db } from '../../lib/db.js';
import { requestAsAdmin } from '../../test-utils/auth.js';

it('completa una recepción una sola vez y actualiza el costo de compra', async t => {
  const branchId = randomUUID();
  const supplierId = randomUUID();
  const categoria = `test-recepcion-${branchId}`;
  t.after(async () => {
    await db.stockMovement.deleteMany({ where: { branchId } });
    await db.reception.deleteMany({ where: { sucursalId: branchId } });
    await db.product.deleteMany({ where: { categoria } });
    await db.branch.deleteMany({ where: { id: branchId } });
    await db.supplier.deleteMany({ where: { id: supplierId } });
  });
  await db.branch.create({
    data: { id: branchId, nombre: 'Sucursal receptora', codigo: branchId.slice(0, 12), direccion: 'Santiago' },
  });
  await db.supplier.create({
    data: { id: supplierId, nombre: 'Proveedor de prueba', rut: supplierId.slice(0, 18) },
  });
  const product = await db.product.create({
    data: { nombre: 'Producto recibido', categoria, precio: 5500, precioCompra: 1000 },
  });

  async function request(path: string, method: string, data: object, status: number) {
    const response = await requestAsAdmin(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.text();
    assert.equal(response.status, status, body);
    return JSON.parse(body);
  }
  const date = new Date().toISOString();
  const pending = await request('/api/recepciones', 'POST', {
    proveedorId: supplierId,
    sucursalId: branchId,
    fechaRecepcion: date,
    fechaDocumento: date,
    numeroDocumento: '123',
    tipoDocumento: 'FACTURA',
    items: [{ productId: product.id, cantidad: 4, precioUnitario: 2500 }],
  }, 201);
  assert.equal(pending.estado, 'PENDIENTE');
  assert.equal(await db.stockMovement.count({ where: { productId: product.id } }), 0);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).precioCompra, 1000);

  const path = `/api/recepciones/${pending.id}`;
  const results = [await request(path, 'PUT', { estado: 'COMPLETADA' }, 200)];
  await request(path, 'PUT', { estado: 'COMPLETADA' }, 409);
  for (const result of results) {
    assert.equal(result.estado, 'COMPLETADA');
    assert.equal(result.total, 10000);
    assert.equal(result.items[0].productId, product.id);
  }

  const balance = await db.stockByBranch.findUniqueOrThrow({
    where: { productId_branchId: { productId: product.id, branchId } },
  });
  assert.equal(balance.cantidad, 4);
  const updated = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(updated.stock, 4);
  assert.equal(updated.precioCompra, 2500);
  const movements = await db.stockMovement.findMany({ where: { productId: product.id } });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].branchId, branchId);
  assert.equal(movements[0].type, 'recepcion');
  assert.equal(movements[0].quantity, 4);
  assert.equal(movements[0].balanceAfter, 4);
  assert.equal(movements[0].refType, 'reception');
  assert.equal(movements[0].refId, pending.id);
});
