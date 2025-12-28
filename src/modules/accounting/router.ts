import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok, created } from '../../lib/responses.js';

export const accountingRouter = new Hono();

// Cuentas
accountingRouter.get('/accounts', optionalAuth, async (c) => {
  return ok(c, { message: 'Accounts endpoint - to be implemented' });
});

accountingRouter.post('/accounts', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Account creada - to be implemented' });
});

// Asientos
accountingRouter.get('/entries', optionalAuth, async (c) => {
  return ok(c, { message: 'Entries endpoint - to be implemented' });
});

accountingRouter.post('/entries', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Entry creado - to be implemented' });
});

// Libro mayor
accountingRouter.get('/ledger', optionalAuth, async (c) => {
  return ok(c, { message: 'Ledger endpoint - to be implemented' });
});

// Libro IVA
accountingRouter.get('/tax-books', optionalAuth, async (c) => {
  return ok(c, { message: 'Tax books endpoint - to be implemented' });
});

