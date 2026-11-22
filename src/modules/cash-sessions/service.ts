import { PaymentMethod, Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export async function lockOpenCashSession(
  tx: Prisma.TransactionClient,
  branchId: string,
  userId: string
) {
  const [session] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM cash_sessions
    WHERE branch_id = ${branchId} AND user_id = ${userId} AND status = 'abierta'
    FOR NO KEY UPDATE
  `;
  if (!session) throw new AppError(ErrorCodes.CONFLICT_STATE, 'Debes abrir caja antes de vender', 409);
  return session.id;
}

async function requireSession(tx: Prisma.TransactionClient, id: string) {
  const session = await tx.cashSession.findUnique({ where: { id } });
  if (!session) throw new AppError(ErrorCodes.NOT_FOUND, 'Sesión de caja no encontrada', 404);
  return session;
}

async function cashPayments(tx: Prisma.TransactionClient, id: string) {
  const { _sum } = await tx.payment.aggregate({
    where: { cashSessionId: id, method: PaymentMethod.efectivo },
    _sum: { amount: true },
  });
  return _sum.amount ?? 0;
}

export const cashSessionService = {
  async open(branchId: string, userId: string, openingAmount: number) {
    const branch = await db.branch.findFirst({ where: { id: branchId, deletedAt: null, activa: true } });
    if (!branch) throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, 'Sucursal no encontrada', 404);

    try {
      return await db.cashSession.create({ data: { branchId, userId, openingAmount } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'Ya hay una caja abierta para esta sucursal y usuario', 409);
      }
      throw error;
    }
  },

  current(branchId: string, userId: string) {
    return db.cashSession.findFirst({ where: { branchId, userId, status: 'abierta' } });
  },

  close(id: string, closedById: string, countedAmount: number, notes?: string) {
    return db.$transaction(async (tx) => {
      // A POS sale holds this same lock until its payments commit.
      await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${id} FOR NO KEY UPDATE`;
      const session = await requireSession(tx, id);
      if (session.status === 'cerrada') {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'La caja ya está cerrada', 409);
      }

      const expectedAmount = session.openingAmount + await cashPayments(tx, id);
      if (expectedAmount > 2147483647) {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'El monto esperado excede el límite de caja', 409);
      }
      return tx.cashSession.update({
        where: { id },
        data: {
          closedById,
          closedAt: new Date(),
          countedAmount,
          expectedAmount,
          difference: countedAmount - expectedAmount,
          notes,
          status: 'cerrada',
        },
      });
    });
  },

  summary(id: string) {
    return db.$transaction(async (tx) => {
      const session = await requireSession(tx, id);
      const groups = await tx.payment.groupBy({
        by: ['method'],
        where: { cashSessionId: id },
        _sum: { amount: true },
      });
      const totalsByMethod = Object.fromEntries(Object.values(PaymentMethod).map((method) => [method, 0]));
      for (const group of groups) totalsByMethod[group.method] = group._sum.amount ?? 0;
      const salesCount = await tx.order.count({ where: { payments: { some: { cashSessionId: id } } } });
      return {
        ...session,
        totalsByMethod,
        salesCount,
        expectedAmount: session.expectedAmount ?? session.openingAmount + totalsByMethod.efectivo,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  },

  list(branchId?: string, from?: Date, to?: Date) {
    return db.cashSession.findMany({
      where: { branchId, openedAt: { gte: from, lte: to } },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
    });
  },
};
