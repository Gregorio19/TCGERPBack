import { Hono } from 'hono';
import { validateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { generateToken, comparePassword } from '../../lib/auth.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { ok } from '../../lib/responses.js';

export const authRouter = new Hono();

const loginDto = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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

  const token = generateToken({
    userId: user.id,
    username: user.username,
    role,
  });

  return ok(c, {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
    },
  });
});

