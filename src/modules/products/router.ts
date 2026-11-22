import { legacyLowStock } from '../inventory/alerts-router.js';
import { Hono } from 'hono';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { getValidated, validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createProductDto,
  updateProductDto,
  listProductsQueryDto,
  productIdParamDto,
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

// Productos con stock bajo
productsRouter.get('/low-stock', authJWT, rbacGuard, legacyLowStock);

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
    const product = await productService.update(id, data, getAuthUser(c).userId);
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
