import { AppError, ErrorCodes } from './errors.js';

const MAX_FAILURES_PER_IP_USERNAME = 5;
const MAX_FAILURES_PER_USERNAME = 10;
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
  const usernameKey = JSON.stringify([username]);
  const previous = pending.get(username);
  // Serializar por usuario para que las solicitudes de distintas IP respeten el límite.
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(username, promise);

  try {
    await previous;
    const cutoff = Date.now() - WINDOW_MS;
    const recentFailures = (failures.get(key) ?? []).filter((time) => time > cutoff);
    const usernameFailures = (failures.get(usernameKey) ?? []).filter((time) => time > cutoff);
    if (recentFailures.length >= MAX_FAILURES_PER_IP_USERNAME
      || usernameFailures.length >= MAX_FAILURES_PER_USERNAME) {
      throw new AppError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.',
        429,
      );
    }

    const user = await verifyCredentials();
    if (user === null) {
      const now = Date.now();
      failures.set(key, [...recentFailures, now]);
      failures.set(usernameKey, [...usernameFailures, now]);
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Credenciales inválidas', 401);
    }

    failures.delete(key);
    failures.delete(usernameKey);
    return user;
  } finally {
    if (pending.get(username) === promise) pending.delete(username);
    release();
  }
}
