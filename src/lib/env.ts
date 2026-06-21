import { config } from 'dotenv';

config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'change_me',
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  /** Producción: orígenes CORS separados por coma. Vacío → solo https://tcg-erp.com */
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '',
  /** Cloudflare R2 / S3-compatible (adjuntos de clientes) */
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
  S3_REGION: process.env.S3_REGION || 'auto',
  ATTACHMENTS_MAX_BYTES: parseInt(process.env.ATTACHMENTS_MAX_BYTES || '10485760', 10),
  /** `s3` (R2) o `memory` (solo dev local; archivos no persisten) */
  ATTACHMENTS_STORAGE: (process.env.ATTACHMENTS_STORAGE || 's3') as 's3' | 'memory',
} as const;

export function isAttachmentsStorageConfigured(): boolean {
  return Boolean(
    env.S3_ENDPOINT &&
      env.S3_BUCKET &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY
  );
}

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'change_me') {
  throw new Error('JWT_SECRET must be set in production');
}

if (env.NODE_ENV === 'production' && env.ATTACHMENTS_STORAGE === 'memory') {
  throw new Error('ATTACHMENTS_STORAGE=memory is not allowed in production');
}

