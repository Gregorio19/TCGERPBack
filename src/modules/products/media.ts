import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

export const productImagePath = /^\/media\/products\/([1-9]\d*)\/[a-f0-9-]{36}\.webp$/;

function diskPath(path: string) {
  return resolve(env.MEDIA_DIR, path.slice('/media/'.length));
}

export async function writeProductImage(id: number, image: Buffer) {
  const path = `/media/products/${id}/${randomUUID()}.webp`;
  const file = diskPath(path);
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(file, image, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await removeProductImage(id, path);
    throw error;
  }
  return path;
}

export async function removeProductImage(id: number, path: string | null | undefined) {
  if (!path || productImagePath.exec(path)?.[1] !== String(id)) return;
  try {
    await rm(diskPath(path), { force: true });
  } catch (error) {
    logger.warn(`No se pudo eliminar ${path}: ${String(error)}`);
  }
}

export function productImagePaths(product: { imagen?: string | null; imagenes?: string[] }) {
  const paths = product.imagenes?.length ? product.imagenes : [product.imagen];
  return paths.filter((path): path is string => Boolean(path && !/^data:/i.test(path)));
}
