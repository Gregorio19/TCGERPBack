import { config } from 'dotenv';

config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'change_me',
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  /** Producción: orígenes CORS separados por coma. Vacío → solo https://tcg-erp.com */
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '',
} as const;

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'change_me') {
  throw new Error('JWT_SECRET must be set in production');
}

