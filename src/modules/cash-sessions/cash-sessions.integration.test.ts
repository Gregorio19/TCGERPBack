import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
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
