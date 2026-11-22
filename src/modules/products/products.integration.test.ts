import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, it } from 'node:test';
import sharp from 'sharp';
import type { PaginatedResult } from '../../lib/pagination.js';
import type { Product } from '@prisma/client';

const mediaDir = await mkdtemp(join(tmpdir(), 'tcgerp-media-'));
process.env.MEDIA_DIR = mediaDir;
const { db } = await import('../../lib/db.js');
const { requestAsAdmin } = await import('../../test-utils/auth.js');
const { app } = await import('../../app.js');

function jsonRequest(path: string, method: string, data: object) {
  return requestAsAdmin(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function expectProduct(response: Response, status: number): Promise<Product> {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return JSON.parse(body);
}

function upload(path: string, blob: Blob, name: string) {
  const body = new FormData();
  body.append('file', blob, name);
  return requestAsAdmin(path, { method: 'POST', body });
}

it('crea sellados, registra stock inicial y mantiene stock y estado al editar', async t => {
  const branchId = randomUUID();
  const categoria = `test-productos-${branchId}`;
  t.after(async () => {
    await db.stockMovement.deleteMany({ where: { branchId } });
    await db.product.deleteMany({ where: { categoria } });
    await db.branch.deleteMany({ where: { id: branchId } });
  });
  await db.branch.create({
    data: { id: branchId, nombre: 'Sucursal de prueba', codigo: branchId.slice(0, 12), direccion: 'Santiago' },
  });

  const base = { nombre: 'Edición Ñandú', categoria, precio: 75000 };
  const sealed = await expectProduct(await jsonRequest('/api/products', 'POST', base), 201);
  assert.equal(sealed.tipo, 'sellado');
  assert.match(sealed.sku ?? '', /^EDICION-NANDU-[A-Z0-9-]+$/);
  for (const field of ['juego', 'set', 'rareza', 'idioma', 'condicion', 'nroColeccionista'] as const) {
    assert.equal(sealed[field], null);
  }
  assert.equal((await jsonRequest('/api/products', 'POST', { ...base, tipo: 'single' })).status, 422);

  const stocked = await expectProduct(await jsonRequest('/api/products', 'POST', {
    ...base, stock: 5, stockMinimo: 2, activo: false, branchId, precio_compra: 1000, initialCost: 30000,
    rareza: 'valor ignorado',
  }), 201);
  assert.equal(stocked.precioCompra, 30000);
  assert.equal(stocked.stock, 5);
  assert.equal(stocked.stockMinimo, 2);
  assert.equal(stocked.rareza, null);
  const stock = await db.stockByBranch.findUniqueOrThrow({
    where: { productId_branchId: { productId: stocked.id, branchId } },
  });
  assert.equal(stock.cantidad, 5);
  const movement = await db.stockMovement.findFirstOrThrow({ where: { productId: stocked.id, branchId } });
  assert.equal(movement.quantity, 5);
  assert.equal(movement.reason, 'Stock inicial');

  const path = `/api/products/${stocked.id}`;
  assert.equal((await jsonRequest(path, 'PUT', { precio: 75000.5 })).status, 422);
  const updated = await expectProduct(await jsonRequest(path, 'PUT', {
    precio: 76000, stock: 20, activo: true,
  }), 200);
  assert.equal(updated.precio, 76000);
  assert.equal(updated.activo, false);
  assert.equal(updated.stock, 5);
  assert.equal(await db.stockMovement.count({ where: { productId: stocked.id } }), 1);
});

it('valida imágenes y mantiene en disco la galería pública del producto', async t => {
  const categoria = `test-imagenes-${randomUUID()}`;
  t.after(() => db.product.deleteMany({ where: { categoria } }));
  const product = await expectProduct(await jsonRequest('/api/products', 'POST', {
    nombre: 'Producto con fotos', precio: 1000, categoria,
  }), 201);
  const productPath = `/api/products/${product.id}`;
  const imagesPath = `${productPath}/images`;
  const png = await sharp({
    create: { width: 2, height: 3, channels: 3, background: 'blue' },
  }).png().toBuffer();
  const file = new Blob([new Uint8Array(png)], { type: 'image/png' });

  const first = await expectProduct(await upload(imagesPath, file, 'producto.png'), 201);
  const [imagePath] = first.imagenes;
  assert.match(imagePath, new RegExp(`^/media/products/${product.id}/[a-f0-9-]+\\.webp$`));
  assert.equal(first.imagen, imagePath);
  const diskPath = join(mediaDir, imagePath.slice('/media/'.length));
  assert.equal((await sharp(await readFile(diskPath)).metadata()).format, 'webp');
  const publicImage = await app.request(imagePath);
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('Cache-Control') ?? '', /immutable/);
  assert.equal(publicImage.headers.get('Content-Type'), 'image/webp');
  await publicImage.arrayBuffer();
  assert.equal((await app.request('/media/products/%2e%2e%2f.env')).status, 404);
  assert.equal((await upload(imagesPath, new Blob(['%PDF-1.7\n']), 'archivo.pdf')).status, 422);

  const second = await expectProduct(await upload(imagesPath, file, 'segunda.png'), 201);
  const secondPath = second.imagenes[1];
  const reordered = await expectProduct(await jsonRequest(imagesPath, 'PATCH', {
    imagenes: [secondPath, imagePath],
  }), 200);
  assert.equal(reordered.imagen, secondPath);
  const edited = await expectProduct(await jsonRequest(productPath, 'PUT', { precio: 1100, imagenes: [] }), 200);
  assert.deepEqual(edited.imagenes, [secondPath, imagePath]);
  const removed = await expectProduct(await requestAsAdmin(`${imagesPath}?path=${encodeURIComponent(imagePath)}`, {
    method: 'DELETE',
  }), 200);
  assert.deepEqual(removed.imagenes, [secondPath]);
  await assert.rejects(readFile(diskPath), { code: 'ENOENT' });
  assert.equal((await requestAsAdmin(productPath, { method: 'DELETE' })).status, 204);
  await assert.rejects(readFile(join(mediaDir, secondPath.slice('/media/'.length))), { code: 'ENOENT' });
});

after(() => rm(mediaDir, { recursive: true, force: true }));

it('pagina productos y busca por nombre o SKU fuera de la primera página', async t => {
  const token = randomUUID();
  const categoria = `test-paginacion-${token}`;
  t.after(() => db.product.deleteMany({ where: { categoria } }));
  const path = '/api/products';
  const first = await expectProduct(await jsonRequest(path, 'POST', {
    nombre: `A producto ${token}`, categoria, precio: 1000,
  }), 201);
  const second = await expectProduct(await jsonRequest(path, 'POST', {
    nombre: `B producto ${token}`, categoria, precio: 1000,
  }), 201);

  const list = async (params: URLSearchParams) => {
    const response = await requestAsAdmin(`${path}?${params}`);
    assert.equal(response.status, 200);
    return (await response.json()) as PaginatedResult<Product>;
  };
  const paging = { category: categoria, limit: '1', sortBy: 'nombre' };
  const page1 = await list(new URLSearchParams({ ...paging, page: '1' }));
  const page2 = await list(new URLSearchParams({ ...paging, page: '2' }));
  assert.deepEqual(page1.data.map((product: Product) => product.id), [first.id]);
  assert.deepEqual(page2.data.map((product: Product) => product.id), [second.id]);
  assert.deepEqual(page2.pagination, { page: 2, limit: 1, total: 2, totalPages: 2, hasNext: false, hasPrev: true });

  for (const search of [`b PRODUCTO ${token}`, second.sku!.toLowerCase()]) {
    const match = await list(new URLSearchParams({ ...paging, search }));
    assert.deepEqual(match.data.map((product: Product) => product.id), [second.id]);
    assert.equal(match.pagination.total, 1);
  }

  const invalid = await jsonRequest(`/api/inventory/${second.id}`, 'PUT', { precio: -1 });
  assert.equal(invalid.status, 422);
  const body = await invalid.json() as { error: { details: { field: string }[] } };
  assert.equal(body.error.details[0].field, 'precio');
});
