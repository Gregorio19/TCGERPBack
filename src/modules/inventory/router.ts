import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  updateStockDto,
  inventoryAdjustmentDto,
  listInventoryQueryDto,
  listAlertsQueryDto,
  inventoryIdParamDto,
  locationParamDto,
} from './dto.js';
import { inventoryService } from './service.js';
import { ok, created } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapProduct } from '../../lib/mapper.js';
import { z } from 'zod';

export const inventoryRouter = new Hono();

// Listar inventario
inventoryRouter.get(
  '/',
  optionalAuth,
  validateQuery(listInventoryQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listInventoryQueryDto>;
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
      location: query.location,
      lowStock: query.lowStock,
      outOfStock: query.outOfStock,
      branchId: query.branchId,
      productId: query.productId,
    };

    const result = await inventoryService.list({ ...pagination, ...filters });
    return ok(c, {
      ...result,
      data: result.data.map((item: any) => {
        // Si es StockByBranch, mapear diferente
        if (item.product) {
          return {
            ...item,
            product: mapProduct(item.product),
            branch: item.branch,
            cantidad: item.cantidad,
          };
        }
        // Si es Product, mapear normalmente
        return {
          ...mapProduct(item),
          stockByBranch: item.stockByBranch?.map((sb: any) => ({
            ...sb,
            branch: sb.branch,
          })),
        };
      }),
    });
  }
);

// Estadísticas de inventario (DEBE IR ANTES DE /:id)
inventoryRouter.get('/stats', optionalAuth, async (c) => {
  const stats = await inventoryService.getStats();
  return ok(c, stats);
});

// Alertas de inventario
inventoryRouter.get(
  '/alerts',
  optionalAuth,
  validateQuery(listAlertsQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listAlertsQueryDto>;
    const alerts = await inventoryService.getAlerts({
      priority: query.priority,
      type: query.type,
    });
    return ok(c, alerts);
  }
);

// Productos con stock bajo
inventoryRouter.get('/low-stock', optionalAuth, async (c) => {
  const threshold = parseInt(c.req.query('threshold') || '10', 10);
  const products = await inventoryService.getLowStock(threshold);
  return ok(c, products.map(mapProduct));
});

// Productos sin stock
inventoryRouter.get('/out-of-stock', optionalAuth, async (c) => {
  const products = await inventoryService.getOutOfStock();
  return ok(c, products.map(mapProduct));
});

// Actualizar stock de un producto
inventoryRouter.patch(
  '/:id/stock',
  authJWT,
  rbacGuard,
  validateParams(inventoryIdParamDto),
  validateBody(updateStockDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: number };
    const { stockActual, motivo } = (c as any).get('validatedBody') as {
      stockActual: number;
      motivo?: string;
    };
    const product = await inventoryService.updateStock(id, stockActual, motivo);
    return ok(c, mapProduct(product));
  }
);

// Listar ubicaciones (sucursales) (DEBE IR ANTES DE /:id)
inventoryRouter.get('/locations', optionalAuth, async (c) => {
  const locations = await inventoryService.getLocations();
  return ok(c, locations);
});

// Inventario por ubicación (DEBE IR ANTES DE /:id)
inventoryRouter.get(
  '/by-location/:location',
  optionalAuth,
  validateParams(locationParamDto),
  validateQuery(listInventoryQueryDto),
  async (c) => {
    const { location } = (c as any).get('validatedParams') as { location: string };
    const query = (c as any).get('validatedQuery') as z.infer<typeof listInventoryQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;

    const pagination = parsePagination(queryRecord);
    const result = await inventoryService.getByLocation(location, pagination);
    return ok(c, {
      ...result,
      data: result.data.map((item: any) => ({
        ...item,
        product: mapProduct(item.product),
        branch: item.branch,
        cantidad: item.cantidad,
      })),
    });
  }
);

// Ajuste de inventario (DEBE IR ANTES DE /:id)
inventoryRouter.post(
  '/adjustment',
  authJWT,
  rbacGuard,
  validateBody(inventoryAdjustmentDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof inventoryAdjustmentDto>;
    const result = await inventoryService.adjustInventory(data);
    return created(c, result);
  }
);

// Obtener item de inventario por ID (DEBE IR DESPUÉS DE TODAS LAS RUTAS ESPECÍFICAS)
inventoryRouter.get(
  '/:id',
  optionalAuth,
  validateParams(inventoryIdParamDto),
  async (c) => {
    const params = (c as any).get('validatedParams') as { id: number };
    const item = await inventoryService.getById(params.id);
    return ok(c, {
      ...mapProduct(item),
      stockByBranch: item.stockByBranch?.map((sb: any) => ({
        ...sb,
        branch: sb.branch,
      })),
    });
  }
);

// Actualizar item de inventario (actualizar producto)
inventoryRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(inventoryIdParamDto),
  async (c) => {
    // Por ahora, este endpoint actualiza el producto
    // En el futuro podría actualizar StockByBranch específico
    const params = (c as any).get('validatedParams') as { id: number };
    const body = await c.req.json();
    
    // Importar productService para actualizar
    const { productService } = await import('../products/service.js');
    const updated = await productService.update(params.id, body);
    return ok(c, mapProduct(updated));
  }
);
