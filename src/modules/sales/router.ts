import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok, created } from '../../lib/responses.js';

export const salesRouter = new Hono();

// Ventas
salesRouter.get('/', optionalAuth, async (c) => {
  return ok(c, { message: 'Sales endpoint - to be implemented' });
});

salesRouter.post('/', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Venta creada - to be implemented' });
});

// Órdenes (cuando se monta en /orders, este path es /)
salesRouter.get('/', optionalAuth, async (c) => {
  if (c.req.path.startsWith('/orders')) {
    return ok(c, { message: 'Orders endpoint - to be implemented' });
  }
  return ok(c, { message: 'Sales endpoint - to be implemented' });
});

salesRouter.post('/', authJWT, rbacGuard, async (c) => {
  if (c.req.path.startsWith('/orders')) {
    return created(c, { message: 'Orden creada - to be implemented' });
  }
  return created(c, { message: 'Venta creada - to be implemented' });
});

salesRouter.get('/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  if (c.req.path.startsWith('/orders')) {
    return ok(c, { message: `Order ${id} - to be implemented` });
  }
  return ok(c, { message: `Sale ${id} - to be implemented` });
});

salesRouter.put('/:id', authJWT, rbacGuard, async (c) => {
  const id = c.req.param('id');
  if (c.req.path.startsWith('/orders')) {
    return ok(c, { message: `Order ${id} updated - to be implemented` });
  }
  return ok(c, { message: `Sale ${id} updated - to be implemented` });
});

salesRouter.delete('/:id', authJWT, rbacGuard, async (c) => {
  const id = c.req.param('id');
  if (c.req.path.startsWith('/orders')) {
    return ok(c, { message: `Order ${id} deleted - to be implemented` });
  }
  return ok(c, { message: `Sale ${id} deleted - to be implemented` });
});

