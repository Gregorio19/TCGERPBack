import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody } from '../../lib/validation.js';
import { ok, created } from '../../lib/responses.js';
import { uuidSchema } from '../../lib/validation.js';
import { productService } from '../products/service.js';
import { orderService } from '../sales/service.js';
import { mapProduct } from '../../lib/mapper.js';
import { paymentsDto } from '../sales/payments.js';

export const posRouter = new Hono();

const posSaleDto = z.object({
  clienteId: uuidSchema,
  sucursalId: uuidSchema.optional(),
  payments: paymentsDto,
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        cantidad: z.number().int().positive(),
      })
    )
    .min(1).max(100),
});

posRouter.get('/products', authJWT, rbacGuard, async (c) => {
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
  const order = await orderService.createPos(body, getAuthUser(c).userId);
  return created(c, {
    ordenId: order.id,
    numero: order.numero,
    total: order.total,
    estado: order.estado,
    vendedorId: order.vendedorId,
    vendedor: order.vendedor,
    payments: order.payments,
    amountTendered: order.amountTendered,
    change: order.change,
  });
});
