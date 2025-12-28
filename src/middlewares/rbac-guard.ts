import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { can, mapPathToResource } from '../lib/rbac.js';
import { JWTPayload } from '../lib/auth.js';

export const rbacGuard = async (c: Context, next: Next) => {
  const user = c.get('user') as JWTPayload | undefined;

  if (!user) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Usuario no autenticado', 401);
  }

  const path = c.req.path;
  const method = c.req.method;

  const resourceAction = mapPathToResource(path, method);

  if (!resourceAction) {
    // Si no se puede mapear, permitir (puede ser endpoint público)
    await next();
    return;
  }

  const { resource, action } = resourceAction;

  // Verificar permisos
  if (!can(user.role, resource, action)) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      `No tiene permisos para ${action} en ${resource}`,
      403
    );
  }

  await next();
};

