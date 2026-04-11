import { randomBytes } from 'crypto';
import { db } from './db.js';

const REFRESH_DAYS = 7;

export function newRefreshTokenValue(): string {
  return randomBytes(48).toString('base64url');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = newRefreshTokenValue();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);
  await db.refreshToken.create({
    data: { token, userId, expiresAt },
  });
  return token;
}

/** Valida, elimina (rotación) y devuelve userId; si inválido o expirado, null. */
export async function consumeRefreshToken(rawToken: string): Promise<string | null> {
  const row = await db.refreshToken.findUnique({ where: { token: rawToken } });
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await db.refreshToken.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  await db.refreshToken.delete({ where: { id: row.id } });
  return row.userId;
}
