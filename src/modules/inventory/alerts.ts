import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { uuidSchema } from '../../lib/validation.js';

export const STOCK_MINIMO_REF = 5;

export const branchFilterDto = z.object({ branchId: uuidSchema.optional() });

type StockAlert = {
  productId: number;
  nombre: string;
  branchId: string;
  cantidad: number;
  minimo: number;
};

function stockAlertRows(branchId?: string) {
  return Prisma.sql`
    FROM products p
    CROSS JOIN branches b
    LEFT JOIN stock_by_branch s ON s.product_id = p.id AND s.branch_id = b.id
    WHERE p.activo AND p.deleted_at IS NULL AND b.activa AND b.deleted_at IS NULL
      ${branchId ? Prisma.sql`AND b.id = ${branchId}` : Prisma.empty}
      AND COALESCE(s.cantidad, 0) <= COALESCE(NULLIF(p.stock_minimo, 0), ${STOCK_MINIMO_REF}::integer)
  `;
}

export const stockAlertsService = {
  async list(branchId?: string) {
    const items = await db.$queryRaw<StockAlert[]>`
      SELECT p.id AS "productId", p.nombre, b.id AS "branchId", COALESCE(s.cantidad, 0) AS cantidad,
             COALESCE(NULLIF(p.stock_minimo, 0), ${STOCK_MINIMO_REF}::integer) AS minimo
      ${stockAlertRows(branchId)}
      ORDER BY cantidad, p.id, b.id
    `;
    return { count: items.length, items };
  },

  async count(branchId: string | undefined, tx: Prisma.TransactionClient = db) {
    const [row] = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count ${stockAlertRows(branchId)}
    `;
    return Number(row.count);
  },

  // Existing clients use a global balance, an explicit threshold and a Product[] response.
  legacyLowStock(threshold: number) {
    return db.product.findMany({
      where: { activo: true, deletedAt: null, stock: { lte: threshold, gt: 0 } },
      orderBy: [{ stock: 'asc' }, { id: 'asc' }],
    });
  },
};
