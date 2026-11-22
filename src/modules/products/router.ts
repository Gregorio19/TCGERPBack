import { bodyLimit } from 'hono/body-limit';
import { inventoryService } from '../inventory/service.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { processAttachmentFile, PRODUCT_IMAGE_MAX_BYTES } from '../../lib/attachments/process-file.js';
import { addProductImage, deleteProductImage, reorderProductImages } from './images.js';
import { legacyLowStock } from '../inventory/alerts-router.js';
import { Hono } from 'hono';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { getValidated, validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createProductDto,
  updateProductDto,
  listProductsQueryDto,
  lookupProductQueryDto,
  productIdParamDto,
  reorderProductImagesDto,
  updateStockDto,
} from './dto.js';
import { parseProductsListQuery, productService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { mapProduct } from '../../lib/mapper.js';

export const productsRouter = new Hono();

// Listar productos
productsRouter.get(
  '/',
  authJWT,
  rbacGuard,
  validateQuery(listProductsQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listProductsQueryDto);
    const result = await productService.list(parseProductsListQuery(query));
    return ok(c, {
      ...result,
      data: result.data.map(mapProduct),
    });
  }
);

// Listar productos inactivos (solo autenticados con permisos)
productsRouter.get(
  '/inactive',
  authJWT,
  rbacGuard,
  validateQuery(listProductsQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listProductsQueryDto);
    const result = await productService.listInactive(parseProductsListQuery(query));
    return ok(c, {
      ...result,
      data: result.data.map(mapProduct),
    });
  }
);

// Crear producto
productsRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createProductDto),
  async (c) => {
    const data = getValidated(c, 'validatedBody', createProductDto);
    const product = await productService.create(data, getAuthUser(c).userId);
    return created(c, mapProduct(product));
  }
);

// Estadísticas
productsRouter.get('/stats', authJWT, rbacGuard, async (c) => {
  const stats = await productService.getStats();
  return ok(c, stats);
});

// Categorías
productsRouter.get('/categories', authJWT, rbacGuard, async (c) => {
  const categories = await productService.getCategories();
  return ok(c, categories);
});

productsRouter.get('/stock-branches', authJWT, rbacGuard, async (c) => {
  const branches = await inventoryService.getLocations();
  return ok(c, branches.map(({ id, nombre }) => ({ id, nombre })));
});

// Productos con stock bajo
productsRouter.get('/low-stock', authJWT, rbacGuard, legacyLowStock);

productsRouter.get('/lookup', authJWT, rbacGuard, validateQuery(lookupProductQueryDto), async (c) => {
  const { code, branchId } = getValidated(c, 'validatedQuery', lookupProductQueryDto);
  return ok(c, mapProduct(await productService.lookup(code, branchId)));
});

// Obtener producto por ID
productsRouter.get(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(productIdParamDto),
  async (c) => {
    const params = getValidated(c, 'validatedParams', productIdParamDto);
    const id = params.id;
    const product = await productService.getById(id);
    return ok(c, mapProduct(product));
  }
);

// Actualizar producto
productsRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(productIdParamDto),
  validateBody(updateProductDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', productIdParamDto);
    const data = getValidated(c, 'validatedBody', updateProductDto);
    const product = await productService.update(id, data);
    return ok(c, mapProduct(product));
  }
);

// Eliminar producto
productsRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(productIdParamDto),
  async (c) => {
    const params = getValidated(c, 'validatedParams', productIdParamDto);
    const id = params.id;
    await productService.delete(id);
    return noContent(c);
  }
);

// Actualizar stock
productsRouter.patch(
  '/:id/stock',
  authJWT,
  rbacGuard,
  validateParams(productIdParamDto),
  validateBody(updateStockDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', productIdParamDto);
    const { stock } = getValidated(c, 'validatedBody', updateStockDto);
    const product = await productService.updateStock(id, stock, getAuthUser(c).userId);
    return ok(c, mapProduct(product));
  }
);

productsRouter.post(
  '/:id/images',
  authJWT,
  rbacGuard,
  validateParams(productIdParamDto),
  bodyLimit({ maxSize: PRODUCT_IMAGE_MAX_BYTES + 64 * 1024 }),
  async (c) => {
    const id = getValidated(c, 'validatedParams', productIdParamDto).id;
    const form = await c.req.formData().catch(() => null);
    const files = form?.getAll('file') ?? [];
    const file = files[0];
    if (!form || !file || typeof file === 'string' || [...form.values()].length !== 1) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Envía una imagen en el campo file', 422);
    }
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      throw new AppError(ErrorCodes.INVALID_RANGE, 'La imagen supera 10 MB', 422);
    }
    const image = await processAttachmentFile(Buffer.from(await file.arrayBuffer()), file.name, { productImage: true });
    return created(c, mapProduct(await addProductImage(id, image.buffer)));
  }
);

productsRouter.delete('/:id/images', authJWT, rbacGuard, validateParams(productIdParamDto), async (c) => {
  const id = getValidated(c, 'validatedParams', productIdParamDto).id;
  const path = c.req.query('path');
  if (!path) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Indica la ruta de la imagen', 422);
  return ok(c, mapProduct(await deleteProductImage(id, path)));
});

productsRouter.patch(
  '/:id/images', authJWT, rbacGuard, validateParams(productIdParamDto), validateBody(reorderProductImagesDto),
  async (c) => {
    const id = getValidated(c, 'validatedParams', productIdParamDto).id;
    const { imagenes } = getValidated(c, 'validatedBody', reorderProductImagesDto);
    return ok(c, mapProduct(await reorderProductImages(id, imagenes)));
  }
);
