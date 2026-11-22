import assert from 'node:assert/strict';
import app from '../app.js';

export async function loginAdmin(): Promise<string> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: process.env.SEED_ADMIN_PASSWORD ?? 'password123',
    }),
  });

  assert.equal(response.status, 200, 'login del administrador del seed');
  const { token } = (await response.json()) as { token?: string };
  assert.ok(token, 'login debe devolver un token de acceso');
  return `Bearer ${token}`;
}

let adminBearer: Promise<string> | undefined;

export async function requestAsAdmin(path: string, init?: RequestInit): Promise<Response> {
  adminBearer ??= loginAdmin();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', await adminBearer);
  return app.request(path, { ...init, headers });
}
