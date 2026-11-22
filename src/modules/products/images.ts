import type { Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { productImagePaths, removeProductImage, writeProductImage } from './media.js';
import { lockProduct } from './service.js';

function setImages(tx: Prisma.TransactionClient, id: number, imagenes: string[]) {
  return tx.product.update({ where: { id }, data: { imagenes, imagen: imagenes[0] ?? null } });
}

export async function addProductImage(id: number, image: Buffer) {
  let path: string | undefined;
  try {
    return await db.$transaction(async tx => {
      const paths = productImagePaths(await lockProduct(tx, id));
      if (paths.length >= 4) {
        throw new AppError(ErrorCodes.INVALID_RANGE, 'El producto admite hasta 4 imágenes', 422);
      }
      path = await writeProductImage(id, image);
      return setImages(tx, id, [...paths, path]);
    });
  } catch (error) {
    await removeProductImage(id, path);
    throw error;
  }
}

export async function deleteProductImage(id: number, path: string) {
  const { product, removed } = await db.$transaction(async tx => {
    const current = await lockProduct(tx, id);
    const paths = productImagePaths(current);
    if (!paths.includes(path)) return { product: current, removed: false };
    const product = await setImages(tx, id, paths.filter(image => image !== path));
    return { product, removed: true };
  });
  if (removed) await removeProductImage(id, path);
  return product;
}

export async function reorderProductImages(id: number, paths: string[]) {
  return db.$transaction(async tx => {
    const current = productImagePaths(await lockProduct(tx, id));
    if (paths.length !== current.length || new Set(paths).size !== paths.length ||
        paths.some(path => !current.includes(path))) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Indica todas las imágenes actuales en el orden deseado', 422);
    }
    return setImages(tx, id, paths);
  });
}
