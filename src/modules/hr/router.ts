import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok, created } from '../../lib/responses.js';

export const hrRouter = new Hono();

// Empleados
hrRouter.get('/employees', optionalAuth, async (c) => {
  return ok(c, { message: 'Employees endpoint - to be implemented' });
});

hrRouter.post('/employees', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Employee creado - to be implemented' });
});

// Contratos
hrRouter.get('/contracts', optionalAuth, async (c) => {
  return ok(c, { message: 'Contracts endpoint - to be implemented' });
});

hrRouter.post('/contracts', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Contract creado - to be implemented' });
});

// Nómina
hrRouter.get('/payroll', optionalAuth, async (c) => {
  return ok(c, { message: 'Payroll endpoint - to be implemented' });
});

hrRouter.post('/payroll', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Payroll creado - to be implemented' });
});

// Imposiciones
hrRouter.get('/contributions', optionalAuth, async (c) => {
  return ok(c, { message: 'Contributions endpoint - to be implemented' });
});

hrRouter.post('/contributions', authJWT, rbacGuard, async (c) => {
  return created(c, { message: 'Contribution creado - to be implemented' });
});

