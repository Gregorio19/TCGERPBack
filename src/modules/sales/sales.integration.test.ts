import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { db } from '../../lib/db.js';
import { requestAsAdmin } from '../../test-utils/auth.js';

function post(path: string, body: unknown) {
  return requestAsAdmin(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function expectJson(response: Response, status: number) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return JSON.parse(text);
}

it('POS: exige caja, registra pagos y stock de forma atómica y permite cuadrar la caja', async (t) => {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const branchId = randomUUID();
  const customerId = randomUUID();
  const productId = randomInt(100_000_000, 2_000_000_000);
  const secondProductId = productId - 1;
  const productIds = [productId, secondProductId];
  t.after(async () => {
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { order: { clienteId: customerId } } });
      await tx.order.deleteMany({ where: { clienteId: customerId } });
      await tx.cashSession.deleteMany({ where: { branchId } });
      await tx.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
      await tx.product.deleteMany({ where: { id: { in: productIds } } });
      await tx.customer.deleteMany({ where: { id: customerId } });
      await tx.branch.deleteMany({ where: { id: branchId } });
    });
  });

  await db.branch.create({
    data: { id: branchId, codigo: branchId.slice(0, 12), nombre: 'Caja de prueba', direccion: 'Santiago' },
  });
  await db.customer.create({
    data: { id: customerId, nombre: 'Cliente POS', telefono: '+56912345678' },
  });
  await db.product.create({
    data: {
      id: productId, nombre: 'Producto POS', categoria: 'test', precio: 1000, stock: 9,
      stockByBranch: { create: [{ branchId, cantidad: 5 }, { branchId: admin.sucursalId, cantidad: 4 }] },
    },
  });
  await db.product.create({
    data: {
      id: secondProductId, nombre: 'Segundo producto POS', categoria: 'test', precio: 1000, stock: 1,
      stockByBranch: { create: { branchId, cantidad: 1 } },
    },
  });

  const salePath = '/api/pos/sale';
  const sale = {
    clienteId: customerId,
    sucursalId: branchId,
    items: [{ productId, cantidad: 2 }],
    payments: [{ method: 'efectivo', amount: 2000 }, { method: 'debito', amount: 1000, reference: 'TBK-001' }],
  };

  await t.test('rechaza una venta sin caja abierta', async () => {
    const error = await expectJson(await post(salePath, sale), 409);
    assert.equal(error.error.message, 'Debes abrir caja antes de vender');
    assert.equal(await db.order.count({ where: { clienteId: customerId } }), 0);
  });

  const session = await expectJson(await post('/api/cash-sessions/open', { branchId, openingAmount: 5000 }), 201);

  await t.test('completa una venta con pagos mixtos, vuelto y vendedor', async () => {
    const result = await expectJson(await post(salePath, sale), 201);
    assert.equal(result.estado, 'completada');
    assert.equal(result.total, 2380);
    assert.equal(result.amountTendered, 2000);
    assert.equal(result.change, 620);
    assert.equal(result.vendedorId, admin.id);
    assert.deepEqual(result.vendedor, { id: admin.id, nombre: admin.nombre });

    const order = await db.order.findUniqueOrThrow({
      where: { id: result.ordenId },
      include: { payments: { orderBy: { method: 'asc' } } },
    });
    assert.equal(order.vendedorId, admin.id);
    assert.deepEqual(order.payments.map(({ method, amount, cashSessionId, reference }) => (
      { method, amount, cashSessionId, reference }
    )), [
      { method: 'efectivo', amount: 1380, cashSessionId: session.id, reference: null },
      { method: 'debito', amount: 1000, cashSessionId: session.id, reference: 'TBK-001' },
    ]);
    const stock = await db.stockByBranch.findUniqueOrThrow({
      where: { productId_branchId: { productId, branchId } },
    });
    assert.equal(stock.cantidad, 3);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 7);

    const movements = await expectJson(await requestAsAdmin(
      `/api/inventory/movements?productId=${productId}&branchId=${branchId}&type=venta&page=1&pageSize=1`
    ), 200);
    assert.equal(movements.pagination.total, 1);
    const { quantity, balanceAfter, refType, refId, userId } = movements.data[0];
    assert.deepEqual({ quantity, balanceAfter, refType, refId, userId }, {
      quantity: -2, balanceAfter: 3, refType: 'order', refId: order.id, userId: admin.id,
    });
  });

  async function snapshot() {
    const [products, stock, movements, orders] = await Promise.all([
      db.product.findMany({ where: { id: { in: productIds } }, orderBy: { id: 'asc' } }),
      db.stockByBranch.findMany({ where: { productId: { in: productIds } }, orderBy: { id: 'asc' } }),
      db.stockMovement.findMany({ where: { productId: { in: productIds } }, orderBy: { id: 'asc' } }),
      db.order.findMany({
        where: { clienteId: customerId }, include: { payments: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' },
      }),
    ]);
    return { products, stock, movements, orders };
  }

  await t.test('revierte incluso el primer producto si el segundo excede el stock de sucursal', async () => {
    const before = await snapshot();
    const error = await expectJson(await post(salePath, {
      ...sale,
      items: [{ productId: secondProductId, cantidad: 1 }, { productId, cantidad: 4 }],
      payments: [{ method: 'debito', amount: 5950 }],
    }), 409);
    assert.equal(error.error.message, 'Stock insuficiente para Producto POS');
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('rechaza la suma incorrecta y el crédito en tienda insuficiente', async () => {
    const before = await snapshot();
    await expectJson(await post(salePath, { ...sale, payments: [{ method: 'debito', amount: 2379 }] }), 400);
    const error = await expectJson(await post(salePath, {
      ...sale, payments: [{ method: 'credito_tienda', amount: 2380 }],
    }), 409);
    assert.equal(error.error.message, 'Crédito en tienda insuficiente');
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('cuadra la caja con el efectivo aplicado y cuenta una sola venta', async () => {
    const closed = await expectJson(await post(`/api/cash-sessions/${session.id}/close`, {
      countedAmount: 6400, notes: 'Cuadre de prueba',
    }), 200);
    assert.equal(closed.status, 'cerrada');
    assert.equal(closed.expectedAmount, 6380);
    assert.equal(closed.difference, 20);
    assert.equal(closed.closedById, admin.id);
    const summary = await expectJson(await requestAsAdmin(`/api/cash-sessions/${session.id}/summary`), 200);
    assert.equal(summary.salesCount, 1);
    assert.equal(summary.totalsByMethod.efectivo, 1380);
    assert.equal(summary.totalsByMethod.debito, 1000);
  });
  await t.test('completa una orden sin pagos una sola vez aunque se reintente', async () => {
    const order = await expectJson(await post('/api/orders', {
      clienteId: customerId,
      sucursalId: branchId,
      canal: 'online',
      tipoDocumento: 'boleta',
      estado: 'voucher_impreso',
      items: [{ productId, cantidad: 1, precioUnitario: 1000 }],
    }), 201);
    assert.equal(order.vendedorId, admin.id);
    assert.deepEqual(order.payments, []);

    const complete = () => requestAsAdmin(`/api/orders/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'completada' }),
    });
    const responses = await Promise.all([complete(), complete()]);
    for (const response of responses) {
      const completed = await expectJson(response, 200);
      assert.equal(completed.estado, 'completada');
    }
    assert.equal(await db.stockMovement.count({ where: { refType: 'order', refId: order.id } }), 1);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock, 6);
  });
});

it('crea un cliente solo con nombre y teléfono y exige al menos un identificador', async (t) => {
  const nombre = `Cliente B2 ${randomUUID()}`;
  t.after(async () => {
    await db.customer.deleteMany({ where: { nombre } });
  });
  await expectJson(await post('/api/customers', { nombre }), 400);
  const customer = await expectJson(await post('/api/customers', { nombre, telefono: '+56 9 1234 5678' }), 201);
  assert.equal(customer.nombre, nombre);
  assert.equal(customer.telefono, '+56 9 1234 5678');
  assert.equal(customer.apellido, null);
  assert.equal(customer.rut, null);
});
