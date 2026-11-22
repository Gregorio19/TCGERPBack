import { PaymentMethod, Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export async function findAndLockOpenCashSession(
  tx: Prisma.TransactionClient,
  branchId: string,
  userId: string
) {
  const [session] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM cash_sessions
    WHERE branch_id = ${branchId} AND user_id = ${userId} AND status = 'abierta'
    FOR NO KEY UPDATE
  `;
  return session?.id;
}

export async function lockOpenCashSession(
  tx: Prisma.TransactionClient,
  branchId: string,
  userId: string,
  operation = 'vender'
) {
  const id = await findAndLockOpenCashSession(tx, branchId, userId);
  if (!id) throw new AppError(ErrorCodes.CONFLICT_STATE, `Debes abrir caja antes de ${operation}`, 409);
  return id;
}

async function requireSession(tx: Prisma.TransactionClient, id: string) {
  const session = await tx.cashSession.findUnique({ where: { id } });
  if (!session) throw new AppError(ErrorCodes.NOT_FOUND, 'Sesión de caja no encontrada', 404);
  return session;
}

async function cashActivity(tx: Prisma.TransactionClient, id: string) {
  const cash = { cashSessionId: id, method: PaymentMethod.efectivo };
  const [sales, refunds, purchases] = await Promise.all([
    tx.payment.aggregate({ where: { ...cash, amount: { gt: 0 } }, _sum: { amount: true } }),
    tx.payment.aggregate({ where: { ...cash, amount: { lt: 0 } }, _sum: { amount: true } }),
    tx.customerPurchase.aggregate({
      where: { cashSessionId: id, paymentMethod: 'efectivo' }, _sum: { total: true },
    }),
  ]);
  return {
    cashSales: sales._sum.amount ?? 0,
    cashRefunds: Math.abs(refunds._sum.amount ?? 0),
    cashCustomerPurchases: purchases._sum.total ?? 0,
  };
}

function expectedCash(openingAmount: number, activity: Awaited<ReturnType<typeof cashActivity>>) {
  return openingAmount + activity.cashSales - activity.cashRefunds - activity.cashCustomerPurchases;
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
      // Cash operations hold this same lock until their transactions commit.
      await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${id} FOR NO KEY UPDATE`;
      const session = await requireSession(tx, id);
      if (session.status === 'cerrada') {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'La caja ya está cerrada', 409);
      }

      const expectedAmount = expectedCash(session.openingAmount, await cashActivity(tx, id));
      const difference = countedAmount - expectedAmount;
      if (expectedAmount > 2147483647 || expectedAmount < -2147483648 || difference > 2147483647) {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'El monto esperado excede el límite de caja', 409);
      }
      return tx.cashSession.update({
        where: { id },
        data: {
          closedById,
          closedAt: new Date(),
          countedAmount,
          expectedAmount,
          difference,
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
      const salesCount = await tx.order.count({
        where: { payments: { some: { cashSessionId: id, amount: { gt: 0 } } } },
      });
      const activity = await cashActivity(tx, id);
      return {
        ...session,
        totalsByMethod,
        salesCount,
        ...activity,
        expectedAmount: session.expectedAmount ?? expectedCash(session.openingAmount, activity),
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
