import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { JWTPayload } from '../lib/auth.js';
import { getEffectivePermissionNamesForUserId } from '../lib/user-permissions.js';
import { routePermissions } from './route-permissions.js';

export const rbacGuard = async (c: Context, next: Next) => {
  const user = c.get('user') as JWTPayload | undefined;
  if (!user) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Usuario no autenticado', 401);
  }

  const permission = routePermissions.get(`${c.req.method} ${c.req.routePath}`);
  if (!permission) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'No tiene permisos para acceder a esta ruta', 403);
  }

  let permissions = c.get('effectivePermissions') as Set<string> | undefined;
  if (!permissions) {
    permissions = new Set(await getEffectivePermissionNamesForUserId(user.userId));
    c.set('effectivePermissions', permissions);
  }

  if (!permissions.has(permission)) {
    throw new AppError(ErrorCodes.FORBIDDEN, `Se requiere el permiso ${permission}`, 403);
  }

  await next();
};
