import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import app from '../../app.js';
import { generateToken } from '../../lib/auth.js';
import { db } from '../../lib/db.js';
import { requestAsAdmin } from '../../test-utils/auth.js';

it('permite una sola apertura simultánea por usuario y sucursal y volver a abrir tras cerrar', async (t) => {
  const branchId = randomUUID();
  t.after(async () => {
    await db.$transaction(async (tx) => {
      await tx.cashSession.deleteMany({ where: { branchId } });
      await tx.branch.deleteMany({ where: { id: branchId } });
    });
  });
  await db.branch.create({
    data: { id: branchId, codigo: branchId.slice(0, 12), nombre: 'Apertura concurrente', direccion: 'Santiago' },
  });
  const root = '/api/cash-sessions';
  const post = (path: string, body: unknown) => requestAsAdmin(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const open = () => post(`${root}/open`, { branchId, openingAmount: 1500 });
  const results = await Promise.all([open(), open()]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
  const opened = results.find(({ status }) => status === 201);
  assert.ok(opened);
  const session = await opened.json() as { id: string };
  const current = await requestAsAdmin(`${root}/current?branchId=${branchId}`);
  assert.equal(current.status, 200);
  assert.equal((await current.json() as { id: string }).id, session.id);

  const close = await post(`${root}/${session.id}/close`, { countedAmount: 1000 });
  assert.equal(close.status, 200);
  assert.equal((await close.json() as { difference: number }).difference, -500);
  const closed = await requestAsAdmin(`${root}/current?branchId=${branchId}`);
  assert.equal(closed.status, 200);
  assert.equal(await closed.json(), null);
  assert.equal((await open()).status, 201);

  const list = await requestAsAdmin(`${root}?branchId=${branchId}`);
  assert.equal(list.status, 200);
  assert.equal((await list.json() as unknown[]).length, 2);
});

it('impide que otro cajero cierre la caja y permite el cierre a un supervisor', async (t) => {
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const branchId = randomUUID();
  const roleId = randomUUID();
  const cashiers = [randomUUID(), randomUUID()];
  const [ownerId, otherCashierId] = cashiers;
  const permission = await db.permission.findUniqueOrThrow({ where: { nombre: 'sales.create' } });
  t.after(async () => {
    await db.$transaction(async (tx) => {
      await tx.cashSession.deleteMany({ where: { branchId } });
      await tx.user.deleteMany({ where: { id: { in: cashiers } } });
      await tx.role.deleteMany({ where: { id: roleId } });
      await tx.branch.deleteMany({ where: { id: branchId } });
    });
  });
  await db.branch.create({
    data: { id: branchId, codigo: branchId.slice(0, 12), nombre: 'Caja supervisada', direccion: 'Santiago' },
  });
  await db.role.create({
    data: {
      id: roleId, nombre: `Cajero ${roleId}`, descripcion: 'Cajero sin permiso de supervisor',
      rolePermissions: { create: { permissionId: permission.id } },
    },
  });
  for (const id of cashiers) {
    await db.user.create({
      data: {
        id, username: id, email: `${id}@example.com`, nombre: 'Cajero', apellido: 'Prueba',
        passwordHash: admin.passwordHash, sucursalId: branchId, userRoles: { create: { roleId } },
      },
    });
  }
  const session = await db.cashSession.create({ data: { branchId, userId: ownerId, openingAmount: 1000 } });
  const path = `/api/cash-sessions/${session.id}/close`;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countedAmount: 1000 }),
  };
  const token = generateToken({ userId: otherCashierId, username: otherCashierId, role: `Cajero ${roleId}` });
  const rejected = await app.request(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  assert.equal(rejected.status, 403);
  const body = await rejected.json() as { error: { message: string } };
  assert.equal(body.error.message, 'Solo quien abrió la caja o un supervisor puede cerrarla');
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: session.id } })).status, 'abierta');

  const closed = await requestAsAdmin(path, init);
  assert.equal(closed.status, 200);
  assert.equal((await closed.json() as { closedById: string }).closedById, admin.id);
});
