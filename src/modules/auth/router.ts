import { Hono } from 'hono';
import { validateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { generateToken, comparePassword } from '../../lib/auth.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { ok } from '../../lib/responses.js';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { getEffectivePermissionNamesForUserId } from '../../lib/user-permissions.js';
import { issueRefreshToken, consumeRefreshToken } from '../../lib/refresh-token.js';

export const authRouter = new Hono();

const loginDto = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshDto = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post('/login', validateBody(loginDto), async (c) => {
  const { username, password } = (c as any).get('validatedBody') as z.infer<typeof loginDto>;

  // Buscar usuario
  const user = await db.user.findUnique({
    where: { username },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user || !user.activo) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Credenciales inválidas', 401);
  }

  // Verificar contraseña
  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Credenciales inválidas', 401);
  }

  // Obtener el primer rol del usuario (o 'Viewer' por defecto)
  const role = user.userRoles[0]?.role?.nombre || 'Viewer';

  const permissions = await getEffectivePermissionNamesForUserId(user.id);

  const token = generateToken({
    userId: user.id,
    username: user.username,
    role,
  });

  const refreshToken = await issueRefreshToken(user.id);

  return ok(c, {
    token,
    refreshToken,
    expiresIn: 86400,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      permissions,
    },
  });
});

authRouter.post('/refresh', validateBody(refreshDto), async (c) => {
  const { refreshToken: raw } = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
    typeof refreshDto
  >;

  const userId = await consumeRefreshToken(raw);
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Refresh token inválido o expirado', 401);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user || !user.activo || user.deletedAt) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Usuario no válido', 401);
  }

  const role = user.userRoles[0]?.role?.nombre || 'Viewer';
  const permissions = await getEffectivePermissionNamesForUserId(user.id);
  const token = generateToken({
    userId: user.id,
    username: user.username,
    role,
  });
  const refreshToken = await issueRefreshToken(user.id);

  return ok(c, {
    token,
    refreshToken,
    expiresIn: 86400,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      permissions,
    },
  });
});

authRouter.get('/me', authJWT, async (c) => {
  const payload = (c as { get: (k: string) => unknown }).get('user') as {
    userId: string;
    username: string;
    role: string;
  };
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: {
      userRoles: { include: { role: true } },
    },
  });
  if (!user || user.deletedAt || !user.activo) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Usuario no válido', 401);
  }
  const role = user.userRoles[0]?.role?.nombre || payload.role;
  const permissions = await getEffectivePermissionNamesForUserId(user.id);
  return ok(c, {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      permissions,
    },
  });
});

