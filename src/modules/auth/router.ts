import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { validateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { generateToken, comparePassword, JWTPayload } from '../../lib/auth.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { ok } from '../../lib/responses.js';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { getEffectivePermissionNamesForUserId } from '../../lib/user-permissions.js';
import { issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../../lib/refresh-token.js';
import { verifyLogin } from '../../lib/login-rate-limit.js';

export const authRouter = new Hono<{
  Bindings: HttpBindings;
  Variables: { validatedBody: unknown; user: JWTPayload };
}>();

const DUMMY_PASSWORD_HASH = '$2a$10$Atju59QNiuc9NUD7deFoKO6jBEYqfWcaKxfvFCeAj8PW7bGKR0PU6';

const loginDto = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshDto = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post('/login', validateBody(loginDto), async (c) => {
  const { username, password } = c.get('validatedBody') as z.infer<typeof loginDto>;
  const proxyIp = process.env.TRUST_PROXY === '1'
    ? c.req.header('x-real-ip')?.trim() || c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
    : undefined;
  const ip = proxyIp || c.env?.incoming?.socket?.remoteAddress || 'unknown';
  const user = await verifyLogin(ip, username, async () => {
    const candidate = await db.user.findUnique({
      where: { username },
      include: { userRoles: { include: { role: true } } },
    });
    const isValid = await comparePassword(password, candidate?.passwordHash ?? DUMMY_PASSWORD_HASH);
    return isValid && candidate?.activo && !candidate.deletedAt ? candidate : null;
  });

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
  const { refreshToken: raw } = c.get('validatedBody') as z.infer<typeof refreshDto>;

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

authRouter.post('/logout', authJWT, validateBody(refreshDto), async (c) => {
  const { refreshToken } = c.get('validatedBody') as z.infer<typeof refreshDto>;
  const { userId } = c.get('user');
  await revokeRefreshToken(refreshToken, userId);
  return ok(c, { ok: true });
});

authRouter.get('/me', authJWT, async (c) => {
  const payload = c.get('user');
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

