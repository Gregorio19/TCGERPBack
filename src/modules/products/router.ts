import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createProductDto,
  updateProductDto,
  listProductsQueryDto,
  productIdParamDto,
  updateStockDto,
} from './dto.js';
import { productService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapProduct } from '../../lib/mapper.js';
import { z } from 'zod';

export const productsRouter = new Hono();

// Listar productos (público o autenticado)
productsRouter.get(
  '/',
  optionalAuth,
  validateQuery(listProductsQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listProductsQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortOrder) queryRecord.sortOrder = query.sortOrder;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;
    if (query.q) queryRecord.q = query.q;
    const pagination = parsePagination(queryRecord);
    const filters = {
      category: query.category,
      juego: query.juego,
      rareza: query.rareza,
      idioma: query.idioma,
      condicion: query.condicion,
      tipo: query.tipo,
      precioMin: query.precioMin ? parseInt(query.precioMin, 10) : undefined,
      precioMax: query.precioMax ? parseInt(query.precioMax, 10) : undefined,
      stockDisponible: query.stockDisponible === 'true',
    };

    const result = await productService.list({ ...pagination, ...filters });
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
    const data = (c as any).get('validatedBody') as z.infer<typeof createProductDto>;
    const product = await productService.create(data);
    return created(c, mapProduct(product));
  }
);

// Obtener producto por ID
productsRouter.get(
  '/:id',
  optionalAuth,
  validateParams(productIdParamDto),
  async (c) => {
    const params = (c as any).get('validatedParams') as { id: number };
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
    const { id } = (c as any).get('validatedParams') as { id: number };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateProductDto>;
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
    const params = (c as any).get('validatedParams') as { id: number };
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
    const { id } = (c as any).get('validatedParams') as { id: number };
    const { stock } = (c as any).get('validatedBody') as { stock: number };
    const product = await productService.updateStock(id, stock);
    return ok(c, mapProduct(product));
  }
);

// Estadísticas
productsRouter.get('/stats', optionalAuth, async (c) => {
  const stats = await productService.getStats();
  return ok(c, stats);
});

// Categorías
productsRouter.get('/categories', optionalAuth, async (c) => {
  const categories = await productService.getCategories();
  return ok(c, categories);
});

// Productos con stock bajo
productsRouter.get('/low-stock', optionalAuth, async (c) => {
  const threshold = parseInt(c.req.query('threshold') || '10', 10);
  const products = await productService.getLowStock(threshold);
  return ok(c, products.map(mapProduct));
});

