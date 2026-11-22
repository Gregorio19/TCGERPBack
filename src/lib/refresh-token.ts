import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

const REFRESH_DAYS = 7;

export function newRefreshTokenValue(): string {
  return randomBytes(48).toString('base64url');
}

function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = newRefreshTokenValue();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);
  await db.refreshToken.create({
    data: { tokenHash: hashRefreshToken(token), userId, expiresAt },
  });
  return token;
}

/** Valida, elimina (rotación) y devuelve userId; si inválido o expirado, null. */
export async function consumeRefreshToken(rawToken: string): Promise<string | null> {
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
  });
  if (!row) return null;
  const { count } = await db.refreshToken.deleteMany({ where: { id: row.id } });
  return count === 1 && row.expiresAt > new Date() ? row.userId : null;
}

export async function revokeRefreshToken(rawToken: string, userId: string): Promise<void> {
  await db.refreshToken.deleteMany({ where: { tokenHash: hashRefreshToken(rawToken), userId } });
}
