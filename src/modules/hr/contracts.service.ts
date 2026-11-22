import { ContractStatus, Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { buildPaginatedResponse, type PaginationParams } from '../../lib/pagination.js';
import { mapContrato, type ContractWithRelations, type EmployeeWithRelations } from './mapper.js';
import { employeeInclude, requireEmployee } from './employees.service.js';

function nextContractNumber(year: number, seq: number) {
  return `CT-${year}-${String(seq).padStart(4, '0')}`;
}

export const contractsService = {
  async listContracts(
    pagination: PaginationParams & { estado?: string; tipo?: string; empleadoId?: string; search?: string }
  ) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ContractWhereInput = {};
    if (pagination.estado) where.estado = pagination.estado as ContractStatus;
    if (pagination.tipo) where.tipo = pagination.tipo;
    if (pagination.empleadoId) where.employeeId = pagination.empleadoId;
    if (pagination.search) {
      const q = pagination.search.trim();
      where.OR = [
        { numeroContrato: { contains: q, mode: 'insensitive' } },
        { employee: { nombre: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      db.contract.findMany({
        where,
        include: { employee: { include: employeeInclude } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.contract.count({ where }),
    ]);

    const data = rows.map((c) =>
      mapContrato({ ...c, employee: c.employee as EmployeeWithRelations } as ContractWithRelations)
    );
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getContractById(id: string) {
    const c = await db.contract.findUnique({
      where: { id },
      include: { employee: { include: employeeInclude } },
    });
    if (!c) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Contrato no encontrado', 404);
    }
    return mapContrato({
      ...c,
      employee: c.employee as EmployeeWithRelations,
    } as ContractWithRelations);
  },

  async contractsByEmpleado(empleadoId: string) {
    await requireEmployee(empleadoId);
    const rows = await db.contract.findMany({
      where: { employeeId: empleadoId },
      include: { employee: { include: employeeInclude } },
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map((c) =>
      mapContrato({ ...c, employee: c.employee as EmployeeWithRelations } as ContractWithRelations)
    );
  },

  async createContract(input: {
    empleadoId: string;
    tipo: string;
    jornada?: string;
    sueldoBase: number;
    fechaInicio: string;
    fechaFin?: string | null;
    observaciones?: string;
  }) {
    await requireEmployee(input.empleadoId);
    const fi = new Date(input.fechaInicio);
    const ff = input.fechaFin ? new Date(input.fechaFin) : null;
    if (ff && fi > ff) {
      throw new AppError(ErrorCodes.INVALID_DATE_RANGE, 'fechaInicio debe ser <= fechaFin', 422);
    }

    const year = fi.getFullYear();
    const count = await db.contract.count({
      where: { numeroContrato: { startsWith: `CT-${year}-` } },
    });
    const numero = nextContractNumber(year, count + 1);

    const created = await db.$transaction(async (tx) => {
      await tx.contract.updateMany({
        where: { employeeId: input.empleadoId, estado: ContractStatus.vigente },
        data: { estado: ContractStatus.respaldo },
      });

      const c = await tx.contract.create({
        data: {
          employeeId: input.empleadoId,
          numeroContrato: numero,
          tipo: input.tipo,
          jornada: input.jornada ?? 'completa',
          fechaInicio: fi,
          fechaTermino: ff,
          sueldoBase: input.sueldoBase,
          estado: ContractStatus.vigente,
          observaciones: input.observaciones,
        },
        include: { employee: { include: employeeInclude } },
      });
      return c;
    });

    return mapContrato({
      ...created,
      employee: created.employee as EmployeeWithRelations,
    } as ContractWithRelations);
  },

  async updateContract(
    id: string,
    input: { sueldoBase?: number; observaciones?: string; jornada?: string; tipo?: string; fechaFin?: string | null }
  ) {
    const c = await db.contract.findUnique({ where: { id } });
    if (!c) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Contrato no encontrado', 404);
    }
    const updated = await db.contract.update({
      where: { id },
      data: {
        ...(input.sueldoBase != null ? { sueldoBase: input.sueldoBase } : {}),
        ...(input.observaciones !== undefined ? { observaciones: input.observaciones } : {}),
        ...(input.jornada ? { jornada: input.jornada } : {}),
        ...(input.tipo ? { tipo: input.tipo } : {}),
        ...(input.fechaFin !== undefined
          ? { fechaTermino: input.fechaFin ? new Date(input.fechaFin) : null }
          : {}),
      },
      include: { employee: { include: employeeInclude } },
    });
    return mapContrato({
      ...updated,
      employee: updated.employee as EmployeeWithRelations,
    } as ContractWithRelations);
  },

  async terminarContract(id: string, fechaTermino: string, observaciones?: string) {
    const c = await db.contract.findUnique({ where: { id } });
    if (!c) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Contrato no encontrado', 404);
    }
    const ft = new Date(fechaTermino);
    if (c.fechaInicio > ft) {
      throw new AppError(ErrorCodes.INVALID_DATE_RANGE, 'Fecha término inválida', 422);
    }
    const updated = await db.contract.update({
      where: { id },
      data: {
        fechaTermino: ft,
        estado: ContractStatus.terminado,
        observaciones: observaciones ?? c.observaciones,
      },
      include: { employee: { include: employeeInclude } },
    });
    return mapContrato({
      ...updated,
      employee: updated.employee as EmployeeWithRelations,
    } as ContractWithRelations);
  },
};
