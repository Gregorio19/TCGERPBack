import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { buildPaginatedResponse } from '../../lib/pagination.js';
import { uuidSchema } from '../../lib/validation.js';

const date = z.union([z.string().date(), z.string().datetime({ offset: true })]);

export const auditQueryDto = z.object({
  userId: uuidSchema.optional(),
  from: date.optional().transform((value) => value ? new Date(value) : undefined),
  to: date.optional().transform((value) => value
    ? new Date(value.length === 10 ? `${value}T23:59:59.999Z` : value)
    : undefined),
  page: z.coerce.number().int().min(1).max(85899346).default(1),
}).refine(({ from, to }) => !from || !to || from <= to, 'Rango de fechas inválido');

export async function listAudit({ userId, from, to, page }: z.infer<typeof auditQueryDto>) {
  const pageSize = 25;
  const where = { userId, createdAt: { gte: from, lte: to } };
  const [data, total] = await db.$transaction([
    db.auditLog.findMany({
      where, skip: (page - 1) * pageSize, take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    db.auditLog.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return buildPaginatedResponse(data, total, page, pageSize);
}
