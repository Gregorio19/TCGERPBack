import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { verifyToken, JWTPayload } from '../lib/auth.js';

export const authJWT = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Token de autenticación requerido', 401);
  }

  const token = authHeader.substring(7);

  let payload: JWTPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(ErrorCodes.INVALID_TOKEN, 'Token inválido o expirado', 401);
  }
  c.set('user', payload);
  await next();
};
