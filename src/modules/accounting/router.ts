import { Hono } from 'hono';
import { z } from 'zod';
import { AccountType, EntryType } from '@prisma/client';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams, uuidSchema } from '../../lib/validation.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { accountingService } from './service.js';

export const accountingRouter = new Hono();

const accountCreateDto = z.object({
  codigo: z.string().min(1).max(10),
  nombre: z.string().min(1).max(200),
  tipo: z.nativeEnum(AccountType),
  nivel: z.number().int().min(0),
  padreId: uuidSchema.nullable().optional(),
});

const accountUpdateDto = accountCreateDto.partial().omit({ codigo: true });

const idParam = z.object({ id: uuidSchema });

const padreParam = z.object({ padreId: uuidSchema });

const listQ = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  estado: z.string().optional(),
});

const movimientoDto = z.object({
  accountId: uuidSchema,
  debe: z.number().int().min(0),
  haber: z.number().int().min(0),
  descripcion: z.string().max(500).optional(),
});

const entryCreateDto = z.object({
  fecha: z.string().min(1),
  tipo: z.nativeEnum(EntryType).optional(),
  movimientos: z.array(movimientoDto).min(2),
});

const entryUpdateDto = z.object({
  fecha: z.string().min(1).optional(),
  tipo: z.nativeEnum(EntryType).optional(),
  movimientos: z.array(movimientoDto).min(2).optional(),
});

// --- Cuentas ---
accountingRouter.get('/accounts/tree', optionalAuth, async (c) => {
  return ok(c, await accountingService.getTree());
});

accountingRouter.get(
  '/accounts/:padreId/children',
  optionalAuth,
  validateParams(padreParam),
  async (c) => {
    const { padreId } = (c as { get: (k: string) => unknown }).get('validatedParams') as { padreId: string };
    return ok(c, await accountingService.getChildren(padreId));
  }
);

accountingRouter.get('/accounts', optionalAuth, async (c) => {
  return ok(c, await accountingService.listAccounts());
});

accountingRouter.post('/accounts', authJWT, rbacGuard, validateBody(accountCreateDto), async (c) => {
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof accountCreateDto>;
  const row = await accountingService.createAccount(body);
  return created(c, row);
});

accountingRouter.get('/accounts/:id', optionalAuth, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await accountingService.getAccount(id));
});

accountingRouter.put('/accounts/:id', authJWT, rbacGuard, validateParams(idParam), validateBody(accountUpdateDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof accountUpdateDto>;
  return ok(c, await accountingService.updateAccount(id, body));
});

accountingRouter.delete('/accounts/:id', authJWT, rbacGuard, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  await accountingService.deleteAccount(id);
  return noContent(c);
});

// --- Asientos ---
accountingRouter.get('/entries', optionalAuth, validateQuery(listQ), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listQ>;
  return ok(c, await accountingService.listEntries(q as Record<string, string | undefined>));
});

accountingRouter.post('/entries', authJWT, rbacGuard, validateBody(entryCreateDto), async (c) => {
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof entryCreateDto>;
  const row = await accountingService.createEntry({
    fecha: new Date(body.fecha),
    tipo: body.tipo,
    movimientos: body.movimientos,
  });
  return created(c, row);
});

accountingRouter.get('/entries/:id', optionalAuth, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await accountingService.getEntry(id));
});

accountingRouter.put('/entries/:id', authJWT, rbacGuard, validateParams(idParam), validateBody(entryUpdateDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof entryUpdateDto>;
  const row = await accountingService.updateEntry(id, {
    fecha: body.fecha ? new Date(body.fecha) : undefined,
    tipo: body.tipo,
    movimientos: body.movimientos,
  });
  return ok(c, row);
});

accountingRouter.delete('/entries/:id', authJWT, rbacGuard, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  await accountingService.deleteEntry(id);
  return noContent(c);
});

accountingRouter.post('/entries/:id/approve', authJWT, rbacGuard, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await accountingService.approveEntry(id));
});

accountingRouter.post('/entries/:id/contabilize', authJWT, rbacGuard, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await accountingService.contabilizeEntry(id));
});

accountingRouter.post('/entries/:id/cancel', authJWT, rbacGuard, validateParams(idParam), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await accountingService.cancelEntry(id));
});

// --- Libro mayor ---
accountingRouter.get('/ledger', optionalAuth, validateQuery(listQ), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listQ>;
  return ok(c, await accountingService.listLedger(q as Record<string, string | undefined>));
});

accountingRouter.get(
  '/ledger/account/:cuentaId',
  optionalAuth,
  validateParams(z.object({ cuentaId: uuidSchema })),
  validateQuery(listQ),
  async (c) => {
    const { cuentaId } = (c as { get: (k: string) => unknown }).get('validatedParams') as { cuentaId: string };
    const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listQ>;
    return ok(c, await accountingService.ledgerByAccount(cuentaId, q as Record<string, string | undefined>));
  }
);

// --- Libro IVA (listado derivado de asientos contabilizados) ---
accountingRouter.get('/tax-books', optionalAuth, validateQuery(listQ), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listQ>;
  return ok(c, await accountingService.taxBooksList(q as Record<string, string | undefined>));
});

const periodoParam = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
});

accountingRouter.get('/tax-books/period/:periodo', optionalAuth, validateParams(periodoParam), async (c) => {
  const { periodo } = (c as { get: (k: string) => unknown }).get('validatedParams') as { periodo: string };
  return ok(c, await accountingService.taxBookByPeriod(periodo));
});

accountingRouter.get('/tax-books/stats', optionalAuth, async (c) => {
  return ok(c, await accountingService.taxBookStats());
});

// --- Estadísticas ---
accountingRouter.get('/stats/general', optionalAuth, async (c) => {
  return ok(c, await accountingService.statsGeneral());
});

accountingRouter.get('/stats/period/:periodo', optionalAuth, validateParams(periodoParam), async (c) => {
  const { periodo } = (c as { get: (k: string) => unknown }).get('validatedParams') as { periodo: string };
  return ok(c, await accountingService.statsPeriod(periodo));
});
