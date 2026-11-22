import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { requestAsAdmin } from '../../test-utils/auth.js';
import { setAttachmentStorageForTests } from '../../lib/storage/index.js';
import { createMemoryAttachmentStorage } from '../../lib/storage/memory-storage.js';
import { env } from '../../lib/env.js';

/** Cliente seed `api-spec/seeds.json` (Juan Pérez). */
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function createVisit(): Promise<string> {
  const res = await requestAsAdmin(`/api/customers/${CUSTOMER_ID}/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion: 'Visita con adjuntos de prueba' }),
  });
  assert.equal(res.status, 201);
  const visit = (await res.json()) as { id: string; attachments: unknown[] };
  assert.ok(visit.id);
  assert.deepEqual(visit.attachments, []);
  return visit.id;
}

describe('Clientes — adjuntos por visita (integración)', () => {
  before(() => {
    setAttachmentStorageForTests(createMemoryAttachmentStorage());
  });

  after(() => {
    setAttachmentStorageForTests(null);
  });

  it('rechaza tipo de archivo no permitido en visita', async () => {
    const visitId = await createVisit();
    const form = new FormData();
    form.append('file', new Blob(['texto'], { type: 'text/plain' }), 'nota.txt');

    const res = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments`,
      {
        method: 'POST',
        body: form,
      }
    );
    assert.equal(res.status, 422);
  });

  it('rechaza archivo mayor a 10 MB en visita', async () => {
    const visitId = await createVisit();
    const oversized = Buffer.alloc(env.ATTACHMENTS_MAX_BYTES + 1, 0xff);
    const form = new FormData();
    form.append('file', new Blob([oversized], { type: 'application/pdf' }), 'grande.pdf');

    const res = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments`,
      {
        method: 'POST',
        body: form,
      }
    );
    assert.equal(res.status, 422);
  });

  it('sube adjunto, lista en visita, embebe en GET visits, descarga y elimina', async () => {
    const visitId = await createVisit();
    const form = new FormData();
    form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'evidencia.png');
    form.append('descripcion', 'Foto de la visita');

    const postRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments`,
      {
        method: 'POST',
        body: form,
      }
    );
    const postText = await postRes.text();
    assert.equal(postRes.status, 201, postText);
    const created = JSON.parse(postText) as {
      id: string;
      visitId: string;
      originalName: string;
      downloadPath: string;
    };
    assert.equal(created.visitId, visitId);
    assert.equal(created.originalName, 'evidencia.png');
    assert.ok(created.downloadPath.includes(visitId));

    const listRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments?page=1&limit=10`
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      data: Array<{ id: string }>;
    };
    assert.ok(listJson.data.some((a) => a.id === created.id));

    const visitsRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits?page=1&limit=20`
    );
    assert.equal(visitsRes.status, 200);
    const visitsJson = (await visitsRes.json()) as {
      data: Array<{ id: string; attachments: Array<{ id: string; originalName: string }> }>;
    };
    const visitRow = visitsJson.data.find((v) => v.id === visitId);
    assert.ok(visitRow);
    assert.ok(visitRow!.attachments.some((a) => a.id === created.id && a.originalName === 'evidencia.png'));

    const downloadRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments/${created.id}/download`,
      {
        redirect: 'manual',
      }
    );
    assert.equal(downloadRes.status, 302);

    const deleteRes = await requestAsAdmin(
      `/api/customers/${CUSTOMER_ID}/visits/${visitId}/attachments/${created.id}`,
      {
        method: 'DELETE',
      }
    );
    assert.equal(deleteRes.status, 204);
  });
});
