import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { JWTPayload } from '../lib/auth.js';
import { userHasAnyPermission } from '../lib/user-permissions.js';

/**
 * Valida permisos canónicos de BD (`permission.nombre`), alineado con RouteGuard del front.
 */
export function canonicalPermissionGuard(...required: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload | undefined;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Usuario no autenticado', 401);
    }

    const allowed = await userHasAnyPermission(user.userId, required);
    if (!allowed) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        `Se requiere alguno de: ${required.join(', ')}`,
        403
      );
    }

    await next();
  };
}
