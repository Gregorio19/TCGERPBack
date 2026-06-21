import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';
import {
  setAttachmentStorageForTests,
} from '../../lib/storage/index.js';
import { createMemoryAttachmentStorage } from '../../lib/storage/memory-storage.js';
import { env } from '../../lib/env.js';

/** Cliente seed `api-spec/seeds.json` (Juan Pérez). */
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';

/** PNG 1×1 px válido (magic bytes image/png). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function loginAdmin(): Promise<string> {
  const loginRes = await app.request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  assert.equal(loginRes.status, 200, 'login seed admin/password123');
  const { token } = (await loginRes.json()) as { token: string };
  return token;
}

describe('Clientes — adjuntos (integración)', () => {
  before(() => {
    setAttachmentStorageForTests(createMemoryAttachmentStorage());
  });

  after(() => {
    setAttachmentStorageForTests(null);
  });

  it('rechaza tipo de archivo no permitido', async () => {
    const token = await loginAdmin();
    const form = new FormData();
    form.append('file', new Blob(['hola mundo'], { type: 'text/plain' }), 'nota.txt');

    const res = await app.request(`http://localhost/api/customers/${CUSTOMER_ID}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 422);
  });

  it('rechaza archivo mayor a 10 MB', async () => {
    const token = await loginAdmin();
    const oversized = Buffer.alloc(env.ATTACHMENTS_MAX_BYTES + 1, 0xff);
    const form = new FormData();
    form.append('file', new Blob([oversized], { type: 'application/pdf' }), 'grande.pdf');

    const res = await app.request(`http://localhost/api/customers/${CUSTOMER_ID}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 422);
  });

  it('sube imagen, lista, descarga y elimina', async () => {
    const token = await loginAdmin();
    const form = new FormData();
    form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'foto.png');
    form.append('descripcion', 'Comprobante de prueba');

    const postRes = await app.request(`http://localhost/api/customers/${CUSTOMER_ID}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const postText = await postRes.text();
    assert.equal(postRes.status, 201, postText);
    const created = JSON.parse(postText) as {
      id: string;
      customerId: string;
      originalName: string;
      mimeType: string;
      originalSizeBytes: number;
      storedSizeBytes: number;
      descripcion: string | null;
      downloadPath: string;
    };
    assert.equal(created.customerId, CUSTOMER_ID);
    assert.equal(created.originalName, 'foto.png');
    assert.ok(created.mimeType.startsWith('image/'));
    assert.equal(created.descripcion, 'Comprobante de prueba');
    assert.ok(created.downloadPath.includes(created.id));

    const listRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/attachments?page=1&limit=10`
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      data: Array<{ id: string; originalName: string }>;
      pagination: { total: number };
    };
    assert.ok(listJson.data.some((a) => a.id === created.id));

    const downloadRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/attachments/${created.id}/download`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      }
    );
    assert.equal(downloadRes.status, 302);
    const location = downloadRes.headers.get('Location');
    assert.ok(location?.startsWith('https://memory.test/'));

    const downloadJsonRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/attachments/${created.id}/download`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );
    assert.equal(downloadJsonRes.status, 200);
    const downloadJson = (await downloadJsonRes.json()) as { url: string };
    assert.ok(downloadJson.url.startsWith('https://memory.test/'));

    const deleteRes = await app.request(
      `http://localhost/api/customers/${CUSTOMER_ID}/attachments/${created.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert.equal(deleteRes.status, 204);
  });
});
