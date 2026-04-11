import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { AccountType, EntryType, EntryStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../lib/pagination.js';

async function nextEntryNumero(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await db.accountingEntry.findFirst({
    where: { numero: { startsWith: `AS-${year}-` } },
    orderBy: { numero: 'desc' },
  });
  let n = 1;
  if (last?.numero) {
    const p = last.numero.split('-').pop();
    n = (parseInt(p || '0', 10) || 0) + 1;
  }
  return `AS-${year}-${String(n).padStart(5, '0')}`;
}

export const accountingService = {
  async listAccounts(where?: Prisma.AccountWhereInput) {
    return db.account.findMany({
      where: { deletedAt: null, ...where },
      orderBy: [{ codigo: 'asc' }],
    });
  },

  async getAccount(id: string) {
    const a = await db.account.findFirst({ where: { id, deletedAt: null } });
    if (!a) throw new AppError(ErrorCodes.NOT_FOUND, 'Cuenta no encontrada', 404);
    return a;
  },

  async createAccount(data: {
    codigo: string;
    nombre: string;
    tipo: AccountType;
    nivel: number;
    padreId?: string | null;
  }) {
    return db.account.create({ data: { ...data, padreId: data.padreId ?? null } });
  },

  async updateAccount(
    id: string,
    data: Partial<{ nombre: string; tipo: AccountType; nivel: number; padreId: string | null; activa: boolean }>
  ) {
    await this.getAccount(id);
    return db.account.update({ where: { id }, data });
  },

  async deleteAccount(id: string) {
    await this.getAccount(id);
    await db.account.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async getTree() {
    const all = await db.account.findMany({
      where: { deletedAt: null },
      orderBy: [{ nivel: 'asc' }, { codigo: 'asc' }],
    });
    const byPadre = new Map<string | null, typeof all>();
    for (const a of all) {
      const k = a.padreId;
      if (!byPadre.has(k)) byPadre.set(k, []);
      byPadre.get(k)!.push(a);
    }
    const build = (padreId: string | null): unknown[] =>
      (byPadre.get(padreId) || []).map((n) => ({
        ...n,
        children: build(n.id),
      }));
    return build(null);
  },

  async getChildren(padreId: string) {
    return db.account.findMany({
      where: { padreId, deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
  },

  async listEntries(query: Record<string, string | undefined>) {
    const { page, pageSize } = parsePagination(query);
    const skip = (page - 1) * pageSize;
    const where: Prisma.AccountingEntryWhereInput = { deletedAt: null };
    if (query.estado) where.estado = query.estado as EntryStatus;
    const [data, total] = await Promise.all([
      db.accountingEntry.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take: pageSize,
        include: { movimientos: { include: { account: true } } },
      }),
      db.accountingEntry.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  },

  async getEntry(id: string) {
    const e = await db.accountingEntry.findFirst({
      where: { id, deletedAt: null },
      include: { movimientos: { include: { account: true } } },
    });
    if (!e) throw new AppError(ErrorCodes.NOT_FOUND, 'Asiento no encontrado', 404);
    return e;
  },

  async createEntry(input: {
    fecha: Date;
    tipo?: EntryType;
    movimientos: { accountId: string; debe: number; haber: number; descripcion?: string }[];
  }) {
    const sumD = input.movimientos.reduce((s, m) => s + m.debe, 0);
    const sumH = input.movimientos.reduce((s, m) => s + m.haber, 0);
    if (sumD !== sumH || sumD <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Debe y haber deben cuadrar y ser mayores a 0', 422);
    }
    const numero = await nextEntryNumero();
    return db.accountingEntry.create({
      data: {
        numero,
        fecha: input.fecha,
        tipo: input.tipo ?? EntryType.manual,
        estado: EntryStatus.borrador,
        totalDebe: sumD,
        totalHaber: sumH,
        movimientos: {
          create: input.movimientos.map((m) => ({
            accountId: m.accountId,
            debe: m.debe,
            haber: m.haber,
            descripcion: m.descripcion,
          })),
        },
      },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async updateEntry(
    id: string,
    input: {
      fecha?: Date;
      tipo?: EntryType;
      movimientos?: { accountId: string; debe: number; haber: number; descripcion?: string }[];
    }
  ) {
    const existing = await this.getEntry(id);
    if (existing.estado !== EntryStatus.borrador) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Solo se editan asientos en borrador', 422);
    }
    if (input.movimientos) {
      const sumD = input.movimientos.reduce((s, m) => s + m.debe, 0);
      const sumH = input.movimientos.reduce((s, m) => s + m.haber, 0);
      if (sumD !== sumH) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Debe y haber deben cuadrar', 422);
      }
      await db.entryMovement.deleteMany({ where: { entryId: id } });
      return db.accountingEntry.update({
        where: { id },
        data: {
          fecha: input.fecha ?? existing.fecha,
          tipo: input.tipo ?? existing.tipo,
          totalDebe: sumD,
          totalHaber: sumH,
          movimientos: {
            create: input.movimientos.map((m) => ({
              accountId: m.accountId,
              debe: m.debe,
              haber: m.haber,
              descripcion: m.descripcion,
            })),
          },
        },
        include: { movimientos: { include: { account: true } } },
      });
    }
    return db.accountingEntry.update({
      where: { id },
      data: { fecha: input.fecha, tipo: input.tipo },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async deleteEntry(id: string) {
    const e = await this.getEntry(id);
    if (e.estado !== EntryStatus.borrador) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Solo se eliminan borradores', 422);
    }
    await db.accountingEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async approveEntry(id: string) {
    const e = await this.getEntry(id);
    if (e.estado !== EntryStatus.borrador) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Estado no permite aprobar', 422);
    }
    return db.accountingEntry.update({
      where: { id },
      data: { estado: EntryStatus.aprobado },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async contabilizeEntry(id: string) {
    const e = await this.getEntry(id);
    if (e.estado !== EntryStatus.aprobado) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Debe estar aprobado para contabilizar', 422);
    }
    return db.accountingEntry.update({
      where: { id },
      data: { estado: EntryStatus.contabilizado },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async cancelEntry(id: string) {
    await this.getEntry(id);
    return db.accountingEntry.update({
      where: { id },
      data: { estado: EntryStatus.anulado },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async listLedger(query: Record<string, string | undefined>) {
    const { page, pageSize } = parsePagination(query);
    const skip = (page - 1) * pageSize;
    const where: Prisma.EntryMovementWhereInput = {
      entry: { deletedAt: null, estado: { not: EntryStatus.anulado } },
    };
    if (query.accountId) where.accountId = query.accountId;
    const [data, total] = await Promise.all([
      db.entryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { account: true, entry: true },
      }),
      db.entryMovement.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  },

  async ledgerByAccount(cuentaId: string, query: Record<string, string | undefined>) {
    return this.listLedger({ ...query, accountId: cuentaId });
  },

  async taxBooksList(query: Record<string, string | undefined>) {
    const { page, pageSize } = parsePagination(query);
    const skip = (page - 1) * pageSize;
    const entries = await db.accountingEntry.findMany({
      where: { deletedAt: null, estado: EntryStatus.contabilizado },
      orderBy: { fecha: 'desc' },
      skip,
      take: pageSize,
      select: { id: true, numero: true, fecha: true, totalDebe: true },
    });
    const total = await db.accountingEntry.count({
      where: { deletedAt: null, estado: EntryStatus.contabilizado },
    });
    return {
      data: entries.map((e) => ({
        id: e.id,
        periodo: e.fecha.toISOString().slice(0, 7),
        numero: e.numero,
        monto: e.totalDebe,
        fecha: e.fecha.toISOString(),
      })),
      pagination: { page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  },

  async taxBookByPeriod(periodo: string) {
    const [y, m] = periodo.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return db.accountingEntry.findMany({
      where: {
        deletedAt: null,
        estado: EntryStatus.contabilizado,
        fecha: { gte: start, lte: end },
      },
      orderBy: { fecha: 'asc' },
      include: { movimientos: { include: { account: true } } },
    });
  },

  async taxBookStats() {
    const n = await db.accountingEntry.count({
      where: { deletedAt: null, estado: EntryStatus.contabilizado },
    });
    return { registros: n };
  },

  async statsGeneral() {
    const [cuentas, asientos, movimientos] = await Promise.all([
      db.account.count({ where: { deletedAt: null } }),
      db.accountingEntry.count({ where: { deletedAt: null } }),
      db.entryMovement.count({
        where: { entry: { deletedAt: null, estado: { not: EntryStatus.anulado } } },
      }),
    ]);
    return { cuentas, asientos, movimientos };
  },

  async statsPeriod(periodo: string) {
    const rows = await this.taxBookByPeriod(periodo);
    const total = rows.reduce((s, e) => s + e.totalDebe, 0);
    return { periodo, asientos: rows.length, totalMovimientos: total };
  },
};
