import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { parsePagination } from '../../lib/pagination.js';

const DEFAULT_TYPES = [
  { id: 'ventas', nombre: 'Ventas', descripcion: 'Reporte de ventas' },
  { id: 'inventario', nombre: 'Inventario', descripcion: 'Stock y movimientos' },
  { id: 'clientes', nombre: 'Clientes', descripcion: 'Clientes y actividad' },
  { id: 'financiero', nombre: 'Financiero', descripcion: 'Resumen financiero' },
];

export const reportsService = {
  types() {
    return DEFAULT_TYPES;
  },

  async stats() {
    const [total, byTipo] = await Promise.all([
      db.generatedReport.count({ where: { deletedAt: null } }),
      db.generatedReport.groupBy({
        by: ['tipo'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    return {
      total,
      porTipo: byTipo.map((g) => ({ tipo: g.tipo, cantidad: g._count._all })),
    };
  },

  async recent(limit: number) {
    const rows = await db.generatedReport.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return rows.map(mapReportRow);
  },

  async list(query: Record<string, string | undefined>) {
    const { page, pageSize } = parsePagination(query);
    const skip = (page - 1) * pageSize;
    const tipo = query.tipo;
    const where = {
      deletedAt: null as null,
      ...(tipo ? { tipo } : {}),
    };
    const [data, total] = await Promise.all([
      db.generatedReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.generatedReport.count({ where }),
    ]);
    return {
      data: data.map(mapReportRow),
      pagination: {
        page,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  },

  async getById(id: string) {
    const row = await db.generatedReport.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Reporte no encontrado', 404);
    }
    return mapReportRow(row);
  },

  async generate(input: {
    tipo: string;
    titulo?: string;
    parametros?: Record<string, unknown>;
    formato?: string;
    createdById?: string;
  }) {
    const resultado = JSON.stringify({
      generadoEn: new Date().toISOString(),
      tipo: input.tipo,
      parametros: input.parametros ?? {},
    });
    const row = await db.generatedReport.create({
      data: {
        tipo: input.tipo,
        titulo: input.titulo ?? `Reporte ${input.tipo}`,
        estado: 'completado',
        parametros: input.parametros as object | undefined,
        resultado,
        formato: input.formato ?? 'json',
        createdById: input.createdById,
      },
    });
    return mapReportRow(row);
  },

  async delete(id: string) {
    const row = await db.generatedReport.findFirst({ where: { id, deletedAt: null } });
    if (!row) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Reporte no encontrado', 404);
    }
    await db.generatedReport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async exportPayload(id: string, formato?: string) {
    const row = await db.generatedReport.findFirst({ where: { id, deletedAt: null } });
    if (!row) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Reporte no encontrado', 404);
    }
    const fmt = formato || row.formato || 'json';
    const text = row.resultado ?? '';
    return {
      id: row.id,
      formato: fmt,
      contenido: text,
      nombreArchivo: `${row.tipo}-${row.id.slice(0, 8)}.${fmt === 'csv' ? 'csv' : 'txt'}`,
    };
  },
};

function mapReportRow(row: {
  id: string;
  tipo: string;
  titulo: string | null;
  estado: string;
  parametros: unknown;
  resultado: string | null;
  formato: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    estado: row.estado,
    parametros: row.parametros,
    resultado: row.resultado,
    formato: row.formato,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
