import { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { env } from '../lib/env.js';

export const corsMiddleware = cors({
  origin: env.NODE_ENV === 'development' ? '*' : ['https://tcg-erp.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

