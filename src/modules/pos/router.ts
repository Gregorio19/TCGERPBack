import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody } from '../../lib/validation.js';
import { ok, created } from '../../lib/responses.js';
import { uuidSchema } from '../../lib/validation.js';
import { productService } from '../products/service.js';
import { orderService } from '../sales/service.js';
import { mapProduct } from '../../lib/mapper.js';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export const posRouter = new Hono();

const posSaleDto = z.object({
  clienteId: uuidSchema,
  sucursalId: uuidSchema.optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        cantidad: z.number().int().positive(),
      })
    )
    .min(1),
});

posRouter.get('/products', optionalAuth, async (c) => {
  const result = await productService.list({
    page: 1,
    pageSize: 100,
    sortBy: 'nombre',
    sortDir: 'asc',
    search: c.req.query('search') || c.req.query('q'),
  });
  return ok(
    c,
    result.data.map((p) => {
      const m = mapProduct(p);
      return {
        id: m.id,
        nombre: m.nombre,
        sku: m.sku,
        precio: m.precio,
        stock: m.stock,
        categoria: m.categoria,
        activo: m.activo,
      };
    })
  );
});

posRouter.post('/sale', authJWT, rbacGuard, validateBody(posSaleDto), async (c) => {
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof posSaleDto>;
  const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };

  const userRow = await db.user.findUnique({
    where: { id: user.userId },
    select: { sucursalId: true },
  });
  const sucursalId = body.sucursalId ?? userRow?.sucursalId;
  if (!sucursalId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'sucursalId requerido (body o usuario)', 400);
  }

  const productIds = body.items.map((i) => i.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds }, deletedAt: null, activo: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const items = body.items.map((it) => {
    const p = byId.get(it.productId);
    if (!p) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto ${it.productId} no disponible`, 404);
    }
    return {
      productId: it.productId,
      cantidad: it.cantidad,
      precioUnitario: p.precio,
      descuento: 0,
    };
  });

  const order = await orderService.create({
    clienteId: body.clienteId,
    sucursalId,
    canal: 'tienda_fisica',
    tipoDocumento: 'boleta',
    items,
    descuentoGeneral: 0,
    costoEnvio: 0,
    estado: 'pendiente',
  });

  return created(c, {
    ordenId: order.id,
    numero: order.numero,
    total: order.total,
  });
});
