import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { it } from 'node:test';
import app from '../../app.js';
import { hashPassword } from '../../lib/auth.js';
import { db } from '../../lib/db.js';

function post(path: string, body: unknown, headers?: Record<string, string>, remoteAddress?: string) {
  return app.request(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, remoteAddress ? { incoming: { socket: { remoteAddress } } } : undefined);
}

it('conserva los refresh tokens antiguos e inicia y rota sesiones usando solo el hash', async (t) => {
  const userId = randomUUID();
  const username = `refresh-${userId}`;
  const password = randomUUID();
  const legacyToken = randomUUID();
  const { sucursalId } = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
  t.after(async () => {
    await db.user.deleteMany({ where: { id: userId } });
  });
  await db.user.create({
    data: {
      id: userId, sucursalId, username, email: `${userId}@example.com`, nombre: 'Auth', apellido: 'Prueba',
      passwordHash: await hashPassword(password),
    },
  });
  const legacy = await db.refreshToken.create({
    data: { userId, token: legacyToken, expiresAt: new Date(Date.now() + 60_000) },
  });
  assert.equal((await post('refresh', { refreshToken: legacyToken })).status, 401);
  assert.equal((await db.refreshToken.findUniqueOrThrow({ where: { id: legacy.id } })).token, legacyToken);

  async function assertHashed(raw: string) {
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const row = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash } });
    assert.equal(row.userId, userId);
    assert.equal(row.token, null);
  }
  const login = await post('login', { username, password });
  assert.equal(login.status, 200);
  const { refreshToken } = await login.json() as { refreshToken: string };
  await assertHashed(refreshToken);
  const rotated = await post('refresh', { refreshToken });
  assert.equal(rotated.status, 200);
  const next = await rotated.json() as { refreshToken: string };
  assert.notEqual(next.refreshToken, refreshToken);
  await assertHashed(next.refreshToken);
  assert.equal((await post('refresh', { refreshToken })).status, 401);
});

it('limita el usuario a diez fallos aunque cambie X-Real-IP con TRUST_PROXY=1', async (t) => {
  const previous = process.env.TRUST_PROXY;
  t.after(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });
  process.env.TRUST_PROXY = '1';
  const credentials = { username: randomUUID(), password: 'incorrecta' };
  const login = (index: number) => post('login', credentials, {
    'X-Real-IP': `192.0.2.${index + 1}`,
    'X-Forwarded-For': '198.51.100.1, 198.51.100.2',
  });
  const failures = await Promise.all(Array.from({ length: 10 }, (_, index) => login(index)));
  assert.deepEqual(failures.map(({ status }) => status), Array(10).fill(401));
  const blocked = await login(10);
  assert.equal(blocked.status, 429);
  const body = await blocked.json() as { error: { code: string } };
  assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED');
});

it('usa la última IP reenviada con proxy de confianza y el socket por defecto', async (t) => {
  const previous = process.env.TRUST_PROXY;
  t.after(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });
  for (const trustProxy of ['1', '0']) {
    process.env.TRUST_PROXY = trustProxy;
    const credentials = { username: randomUUID(), password: 'incorrecta' };
    const login = (index: number, remoteAddress: string) => post('login', credentials, {
      'X-Forwarded-For': `192.0.2.${index + 1}, 198.51.100.2`,
      ...(trustProxy === '0' && { 'X-Real-IP': `192.0.2.${index + 1}` }),
    }, remoteAddress);
    for (let index = 0; index < 5; index++) {
      assert.equal((await login(index, '203.0.113.1')).status, 401);
    }
    assert.equal((await login(5, '203.0.113.1')).status, 429);
    assert.equal((await login(6, '203.0.113.2')).status, trustProxy === '1' ? 429 : 401);
  }
});
