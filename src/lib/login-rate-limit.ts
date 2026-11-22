import { AppError, ErrorCodes } from './errors.js';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, number[]>();
const pending = new Map<string, Promise<void>>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, attempts] of failures) {
    if (attempts[attempts.length - 1] <= cutoff) failures.delete(key);
  }
}, WINDOW_MS).unref();

export async function verifyLogin<T>(
  ip: string,
  username: string,
  verifyCredentials: () => Promise<T | null>,
): Promise<T> {
  const key = JSON.stringify([ip, username]);
  const previous = pending.get(key);
  // Serializar por clave para que las solicitudes simultáneas respeten el límite.
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(key, promise);

  try {
    await previous;
    const cutoff = Date.now() - WINDOW_MS;
    const recentFailures = (failures.get(key) ?? []).filter((time) => time > cutoff);
    if (recentFailures.length >= MAX_FAILURES) {
      throw new AppError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.',
        429,
      );
    }

    const user = await verifyCredentials();
    if (user === null) {
      failures.set(key, [...recentFailures, Date.now()]);
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Credenciales inválidas', 401);
    }

    failures.delete(key);
    return user;
  } finally {
    if (pending.get(key) === promise) pending.delete(key);
    release();
  }
}
