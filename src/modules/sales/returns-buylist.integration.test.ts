import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { it } from 'node:test';
import { db } from '../../lib/db.js';
import { requestAsAdmin } from '../../test-utils/auth.js';

async function expectJson(response: Response, status: number) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return JSON.parse(text);
}

function post(path: string, body: unknown) {
  return requestAsAdmin(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

it('registra devoluciones, crédito en tienda y compras al cliente con sus efectos contables', async (t) => {
  const branchId = randomUUID();
  const customerId = randomUUID();
  const productId = randomInt(100_000_000, 2_000_000_000);
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const orderWhere = { clienteId: customerId };
  const purchasePath = `/api/customers/${customerId}/purchases`;
  const creditPath = `/api/customers/${customerId}/store-credit`;
  const stock = async () => (await db.stockByBranch.findUniqueOrThrow({
    where: { productId_branchId: { productId, branchId } },
  })).cantidad;

  t.after(async () => {
    await db.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { path: { startsWith: `/api/customers/${customerId}/` } } });
      await tx.returnItem.deleteMany({ where: { return: { order: orderWhere } } });
      await tx.return.deleteMany({ where: { order: orderWhere } });
      await tx.customerPurchaseItem.deleteMany({ where: { purchase: { customerId } } });
      await tx.customerPurchase.deleteMany({ where: { customerId } });
      await tx.storeCreditMovement.deleteMany({ where: { customerId } });
      await tx.payment.deleteMany({ where: { order: orderWhere } });
      await tx.order.deleteMany({ where: orderWhere });
      await tx.cashSession.deleteMany({ where: { branchId } });
      await tx.stockMovement.deleteMany({ where: { productId } });
      await tx.product.deleteMany({ where: { id: productId } });
      await tx.customer.deleteMany({ where: { id: customerId } });
      await tx.branch.deleteMany({ where: { id: branchId } });
    });
  });
  await db.branch.create({
    data: { id: branchId, codigo: branchId.slice(0, 12), nombre: 'Caja B3', direccion: 'Santiago' },
  });
  await db.customer.create({ data: { id: customerId, nombre: 'Cliente B3' } });
  await db.product.create({
    data: {
      id: productId, nombre: 'Carta B3', categoria: 'test', precio: 1000, stock: 6, stockMinimo: 8,
      stockByBranch: { create: { branchId, cantidad: 6 } },
    },
  });
  const session = await expectJson(await post('/api/cash-sessions/open', { branchId, openingAmount: 5000 }), 201);

  await t.test('devuelve una orden con descuentos en dos partes', async () => {
    const order = await expectJson(await post('/api/orders', {
      clienteId: customerId, sucursalId: branchId, canal: 'tienda_fisica', tipoDocumento: 'boleta',
      estado: 'completada', descuentoGeneral: 101,
      items: [{ productId, cantidad: 3, precioUnitario: 1000, descuento: 100 }],
      payments: [{ method: 'efectivo', amount: 3331 }],
    }), 201);
    assert.equal(await stock(), 3);
    const path = `/api/orders/${order.id}/returns`;
    const orderItemId = order.items[0].id;
    const partial = await expectJson(await post(path, {
      reason: 'Primera devolución', refundMethod: 'efectivo', items: [{ orderItemId, quantity: 1 }],
    }), 201);
    assert.equal(partial.refundAmount, 1110);
    assert.equal(partial.cashSessionId, session.id);
    assert.equal(await stock(), 4);
    assert.equal((await expectJson(await requestAsAdmin(`/api/orders/${order.id}`), 200)).estado, 'devuelta_parcial');

    await expectJson(await post(path, {
      reason: 'Cantidad excesiva', refundMethod: 'debito', items: [{ orderItemId, quantity: 3 }],
    }), 422);
    const full = await expectJson(await post(path, {
      reason: 'Resto de la orden', refundMethod: 'debito', items: [{ orderItemId, quantity: 2 }],
    }), 201);
    assert.equal(full.refundAmount, 2221);
    assert.equal(await stock(), 6);
    const returned = await expectJson(await requestAsAdmin(`/api/orders/${order.id}`), 200);
    assert.equal(returned.estado, 'devuelta');
    assert.deepEqual(returned.payments.map((payment: { amount: number }) => payment.amount).sort((a: number, b: number) => a - b),
      [-2221, -1110, 3331]);
    assert.equal((await expectJson(await requestAsAdmin(path), 200)).length, 2);
    assert.equal(await db.stockMovement.count({ where: { productId, type: 'devolucion' } }), 2);
  });

  await t.test('abona el reembolso al crédito y paga una venta POS con el saldo', async () => {
    const sale = {
      clienteId: customerId, sucursalId: branchId, items: [{ productId, cantidad: 1 }],
    };
    const first = await expectJson(await post('/api/pos/sale', {
      ...sale, payments: [{ method: 'debito', amount: 1190 }],
    }), 201);
    const order = await expectJson(await requestAsAdmin(`/api/orders/${first.ordenId}`), 200);
    const returned = await expectJson(await post(`/api/orders/${order.id}/returns`, {
      reason: 'Crédito para próxima compra', refundMethod: 'credito_tienda',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
    }), 201);
    const credit = await expectJson(await requestAsAdmin(creditPath), 200);
    assert.equal(credit.balance, 1190);
    assert.equal(credit.movements[0].refId, returned.id);
    assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);

    const payment = { ...sale, payments: [{ method: 'credito_tienda', amount: 1190 }] };
    const responses = await Promise.all([post('/api/pos/sale', payment), post('/api/pos/sale', payment)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    const debited = await expectJson(await requestAsAdmin(creditPath), 200);
    assert.equal(debited.balance, 0);
    assert.equal(debited.movements[0].amount, -1190);
    assert.equal(await stock(), 5);
  });

  await t.test('registra la compra en caja, el ingreso al inventario y la visita', async () => {
    const purchase = await expectJson(await post(purchasePath, {
      branchId, paymentMethod: 'efectivo',
      items: [{ productId, quantity: 2, unitPrice: 100, condition: 'near_mint' }],
    }), 201);
    assert.equal(purchase.total, 200);
    assert.equal(purchase.cashSessionId, session.id);
    assert.equal(await stock(), 7);
    const visit = await db.customerVisit.findUniqueOrThrow({ where: { id: purchase.visitId } });
    assert.equal(visit.tipo, 'venta_a_tienda');
    assert.match(visit.descripcion, /2 × Carta B3/);
    assert.equal(visit.customerId, customerId);
    assert.equal((await expectJson(await requestAsAdmin(purchasePath), 200))[0].id, purchase.id);

    const summary = await expectJson(await requestAsAdmin(`/api/cash-sessions/${session.id}/summary`), 200);
    assert.equal(summary.cashSales, 3331);
    assert.equal(summary.cashRefunds, 1110);
    assert.equal(summary.cashCustomerPurchases, 200);
    assert.equal(summary.expectedAmount, 7021);
    const closed = await expectJson(await post(`/api/cash-sessions/${session.id}/close`, { countedAmount: 7021 }), 200);
    assert.equal(closed.expectedAmount, 7021);
    assert.equal(closed.difference, 0);
  });

  await t.test('muestra alertas, KPIs netos y la auditoría de la compra', async () => {
    const alerts = await expectJson(await requestAsAdmin(`/api/alerts/stock?branchId=${branchId}`), 200);
    assert.deepEqual(alerts.items.find((item: { productId: number }) => item.productId === productId),
      { productId, nombre: 'Carta B3', branchId, cantidad: 7, minimo: 8 });
    const kpis = await expectJson(await requestAsAdmin(`/api/dashboard/kpis?branchId=${branchId}`), 200);
    assert.equal(kpis.ventasMes, 1190);
    assert.equal(typeof kpis.ventasHoy, 'number');
    assert.equal(typeof kpis.clientesNuevosMes, 'number');
    assert.equal(kpis.ticketPromedioMes, 397);
    assert.equal(kpis.unidadesMes, 1);
    assert.equal(kpis.stockCritico, alerts.count);
    assert.deepEqual(kpis.topProductosMes[0], { productId, nombre: 'Carta B3', unidades: 1 });

    for (let attempt = 0; attempt < 40; attempt++) {
      const audit = await expectJson(await requestAsAdmin(`/api/admin/audit?userId=${admin.id}&page=1`), 200);
      const entry = audit.data.find((row: { path: string }) => row.path === purchasePath);
      if (entry) {
        assert.equal(entry.method, 'POST');
        assert.equal(entry.status, 201);
        assert.equal(entry.entity, 'customers');
        assert.equal(entry.entityId, customerId);
        return;
      }
      await setTimeout(50);
    }
    assert.fail('No se encontró la auditoría asíncrona de la compra');
  });
});
