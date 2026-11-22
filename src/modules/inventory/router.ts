import { legacyLowStock } from './alerts-router.js';
import { Hono } from 'hono';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { getValidated, validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  updateStockDto,
  inventoryAdjustmentDto,
  listInventoryQueryDto,
  listAlertsQueryDto,
  listMovementsQueryDto,
  inventoryIdParamDto,
  locationParamDto,
} from './dto.js';
import { inventoryService } from './service.js';
import { ok, created } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapProduct } from '../../lib/mapper.js';

export const inventoryRouter = new Hono();

// Listar inventario
inventoryRouter.get(
  '/',
  authJWT,
  rbacGuard,
  validateQuery(listInventoryQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listInventoryQueryDto);
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
inventoryRouter.get('/stats', authJWT, rbacGuard, async (c) => {
  const stats = await inventoryService.getStats();
  return ok(c, stats);
});

// Alertas de inventario
inventoryRouter.get(
  '/alerts',
  authJWT,
  rbacGuard,
  validateQuery(listAlertsQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listAlertsQueryDto);
    const alerts = await inventoryService.getAlerts({
      priority: query.priority,
      type: query.type,
    });
    return ok(c, alerts);
  }
);

// Productos con stock bajo
inventoryRouter.get('/low-stock', authJWT, rbacGuard, legacyLowStock);

// Productos sin stock
inventoryRouter.get('/out-of-stock', authJWT, rbacGuard, async (c) => {
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
    const { id } = getValidated(c, 'validatedParams', inventoryIdParamDto);
    const { stockActual, motivo } = getValidated(c, 'validatedBody', updateStockDto);
    const product = await inventoryService.updateStock(id, stockActual, getAuthUser(c).userId, motivo);
    return ok(c, mapProduct(product));
  }
);

// Listar ubicaciones (sucursales) (DEBE IR ANTES DE /:id)
inventoryRouter.get('/locations', authJWT, rbacGuard, async (c) => {
  const locations = await inventoryService.getLocations();
  return ok(c, locations);
});

// Inventario por ubicación (DEBE IR ANTES DE /:id)
inventoryRouter.get(
  '/by-location/:location',
  authJWT,
  rbacGuard,
  validateParams(locationParamDto),
  validateQuery(listInventoryQueryDto),
  async (c) => {
    const { location } = getValidated(c, 'validatedParams', locationParamDto);
    const query = getValidated(c, 'validatedQuery', listInventoryQueryDto);
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
    const data = getValidated(c, 'validatedBody', inventoryAdjustmentDto);
    const result = await inventoryService.adjustInventory(data, getAuthUser(c).userId);
    return created(c, result);
  }
);

inventoryRouter.get('/movements', authJWT, rbacGuard, validateQuery(listMovementsQueryDto), async (c) => {
  const { page, pageSize, ...filters } = getValidated(c, 'validatedQuery', listMovementsQueryDto);
  return ok(c, await inventoryService.listMovements(page, pageSize, filters));
});

// Obtener item de inventario por ID (DEBE IR DESPUÉS DE TODAS LAS RUTAS ESPECÍFICAS)
inventoryRouter.get(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(inventoryIdParamDto),
  async (c) => {
    const params = getValidated(c, 'validatedParams', inventoryIdParamDto);
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
    const params = getValidated(c, 'validatedParams', inventoryIdParamDto);
    const body = await c.req.json();
    
    // Importar productService para actualizar
    const { productService } = await import('../products/service.js');
    const updated = await productService.update(params.id, body, getAuthUser(c).userId);
    return ok(c, mapProduct(updated));
  }
);
