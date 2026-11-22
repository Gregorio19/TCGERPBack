import { ContractStatus, PayrollStatus, Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { normalizeRut, validateRut } from '../../lib/rut-validator.js';
import { buildPaginatedResponse, type PaginationParams } from '../../lib/pagination.js';
import { mapEmpleado, type EmployeeWithRelations } from './mapper.js';

/** Incluye el contrato en estado `vigente` (máx. 1 por empleado) para listados y detalle. */
export const employeeInclude = {
  position: true,
  bankData: true,
  socialSecurity: true,
  contracts: {
    where: { estado: ContractStatus.vigente },
    take: 1,
  },
} as const;

export async function requireEmployee(id: string): Promise<EmployeeWithRelations> {
  const e = await db.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!e) {
    throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, 'Empleado no encontrado', 404);
  }
  return e as EmployeeWithRelations;
}

export const employeesService = {
  async listEmployees(
    pagination: PaginationParams & {
      estado?: string;
      cargo?: string;
      departamento?: string;
      fechaIngresoDesde?: string;
      fechaIngresoHasta?: string;
      busqueda?: string;
    }
  ) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EmployeeWhereInput = { deletedAt: null };

    if (pagination.estado) {
      where.estado = pagination.estado as 'activo' | 'inactivo' | 'suspendido' | 'licencia';
    }
    if (pagination.departamento || pagination.cargo) {
      where.position = {
        is: {
          ...(pagination.departamento
            ? { departamento: { contains: pagination.departamento, mode: 'insensitive' } }
            : {}),
          ...(pagination.cargo ? { nombre: { contains: pagination.cargo, mode: 'insensitive' } } : {}),
        },
      };
    }
    if (pagination.fechaIngresoDesde) {
      where.fechaIngreso = {
        ...((where.fechaIngreso as object) || {}),
        gte: new Date(pagination.fechaIngresoDesde),
      };
    }
    if (pagination.fechaIngresoHasta) {
      where.fechaIngreso = {
        ...((where.fechaIngreso as object) || {}),
        lte: new Date(pagination.fechaIngresoHasta),
      };
    }
    if (pagination.busqueda) {
      const q = pagination.busqueda.trim();
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { apellidoPaterno: { contains: q, mode: 'insensitive' } },
        { apellidoMaterno: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { rut: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { apellidoPaterno: 'asc' },
        skip,
        take: pageSize,
      }),
      db.employee.count({ where }),
    ]);

    const data = rows.map((e) => mapEmpleado(e as EmployeeWithRelations));
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getEmployeeById(id: string) {
    return mapEmpleado(await requireEmployee(id));
  },

  async getMyEmployee(userId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, activo: true, deletedAt: null },
      select: { email: true },
    });
    const employee = user && await db.employee.findFirst({
      where: { email: user.email, deletedAt: null },
      include: {
        ...employeeInclude,
        scheduleTemplates: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        scheduleExceptions: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!employee) {
      throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, 'No hay ficha de empleado asociada', 404);
    }
    return {
      ...mapEmpleado(employee),
      schedule: {
        templates: employee.scheduleTemplates,
        exceptions: employee.scheduleExceptions,
      },
    };
  },

  async createEmployee(input: {
    rut: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    email: string;
    telefono?: string;
    fechaNacimiento: string;
    direccion?: Record<string, string>;
    cargoId?: string;
    datosBancarios?: {
      banco: string;
      tipoCuenta: string;
      numeroCuenta: string;
      rutTitular: string;
    };
    previsional?: {
      afp: string;
      salud: string;
      isapre?: string;
      mutual?: boolean;
      afc?: boolean;
      porcentajeAFC?: number;
    };
  }) {
    const rutNorm = normalizeRut(input.rut.trim());
    if (!rutNorm || !validateRut(rutNorm)) {
      throw new AppError(ErrorCodes.INVALID_RUT, 'RUT inválido', 422);
    }

    const created = await db.$transaction(async (tx) => {
      const dupRut = await tx.employee.findUnique({ where: { rut: rutNorm } });
      if (dupRut) {
        throw new AppError(ErrorCodes.DUPLICATE_RUT, 'Ya existe un empleado con ese RUT', 409);
      }
      const dupEmail = await tx.employee.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (dupEmail) {
        throw new AppError(ErrorCodes.DUPLICATE_EMAIL, 'Ya existe un empleado con ese email', 409);
      }

      const emp = await tx.employee.create({
        data: {
          rut: rutNorm,
          nombre: input.nombre,
          apellidoPaterno: input.apellidoPaterno,
          apellidoMaterno: input.apellidoMaterno,
          email: input.email.toLowerCase(),
          telefono: input.telefono,
          direccion: input.direccion ? (input.direccion as Prisma.InputJsonValue) : undefined,
          fechaNacimiento: new Date(input.fechaNacimiento),
          fechaIngreso: new Date(),
          positionId: input.cargoId,
        },
      });

      if (input.datosBancarios) {
        await tx.employeeBankData.create({
          data: {
            employeeId: emp.id,
            banco: input.datosBancarios.banco,
            tipoCuenta: input.datosBancarios.tipoCuenta,
            numeroCuenta: input.datosBancarios.numeroCuenta,
            rutTitular: normalizeRut(input.datosBancarios.rutTitular) ?? input.datosBancarios.rutTitular,
          },
        });
      }
      if (input.previsional) {
        await tx.employeeSocialSecurity.create({
          data: {
            employeeId: emp.id,
            afp: input.previsional.afp,
            salud: input.previsional.salud,
            isapre: input.previsional.isapre,
            mutual: input.previsional.mutual ?? false,
            afc: input.previsional.afc ?? false,
            porcentajeAFC: input.previsional.porcentajeAFC,
          },
        });
      }

      return tx.employee.findUniqueOrThrow({
        where: { id: emp.id },
        include: employeeInclude,
      });
    });

    return mapEmpleado(created as EmployeeWithRelations);
  },

  async updateEmployee(
    id: string,
    input: {
      email?: string;
      telefono?: string;
      estado?: 'activo' | 'inactivo' | 'suspendido' | 'licencia';
      cargoId?: string | null;
      direccion?: Record<string, string>;
      datosBancarios?: {
        banco: string;
        tipoCuenta: string;
        numeroCuenta: string;
        rutTitular: string;
      };
      previsional?: {
        afp: string;
        salud: string;
        isapre?: string;
        mutual?: boolean;
        afc?: boolean;
        porcentajeAFC?: number;
      };
    }
  ) {
    await requireEmployee(id);

    if (input.email) {
      const clash = await db.employee.findFirst({
        where: { email: input.email.toLowerCase(), id: { not: id }, deletedAt: null },
      });
      if (clash) {
        throw new AppError(ErrorCodes.DUPLICATE_EMAIL, 'Email ya registrado', 409);
      }
    }

    await db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(input.email ? { email: input.email.toLowerCase() } : {}),
          ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
          ...(input.estado ? { estado: input.estado } : {}),
          ...(input.cargoId !== undefined ? { positionId: input.cargoId } : {}),
          ...(input.direccion
            ? { direccion: input.direccion as Prisma.InputJsonValue }
            : {}),
        },
      });

      if (input.datosBancarios) {
        await tx.employeeBankData.upsert({
          where: { employeeId: id },
          create: {
            employeeId: id,
            banco: input.datosBancarios.banco,
            tipoCuenta: input.datosBancarios.tipoCuenta,
            numeroCuenta: input.datosBancarios.numeroCuenta,
            rutTitular:
              normalizeRut(input.datosBancarios.rutTitular) ?? input.datosBancarios.rutTitular,
          },
          update: {
            banco: input.datosBancarios.banco,
            tipoCuenta: input.datosBancarios.tipoCuenta,
            numeroCuenta: input.datosBancarios.numeroCuenta,
            rutTitular:
              normalizeRut(input.datosBancarios.rutTitular) ?? input.datosBancarios.rutTitular,
          },
        });
      }
      if (input.previsional) {
        await tx.employeeSocialSecurity.upsert({
          where: { employeeId: id },
          create: {
            employeeId: id,
            afp: input.previsional.afp,
            salud: input.previsional.salud,
            isapre: input.previsional.isapre,
            mutual: input.previsional.mutual ?? false,
            afc: input.previsional.afc ?? false,
            porcentajeAFC: input.previsional.porcentajeAFC,
          },
          update: {
            afp: input.previsional.afp,
            salud: input.previsional.salud,
            isapre: input.previsional.isapre,
            mutual: input.previsional.mutual ?? false,
            afc: input.previsional.afc ?? false,
            porcentajeAFC: input.previsional.porcentajeAFC,
          },
        });
      }
    });

    return mapEmpleado(await requireEmployee(id));
  },

  async deleteEmployee(id: string) {
    await requireEmployee(id);
    await db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), estado: 'inactivo' },
    });
  },

  async estadisticas() {
    const [
      totalEmpleados,
      empleadosActivos,
      empleadosInactivos,
      contratosVigentes,
      contratosPorTerminar,
      payrollsMes,
      sueldos,
    ] = await Promise.all([
      db.employee.count({ where: { deletedAt: null } }),
      db.employee.count({ where: { deletedAt: null, estado: 'activo' } }),
      db.employee.count({ where: { deletedAt: null, estado: 'inactivo' } }),
      db.contract.count({ where: { estado: ContractStatus.vigente } }),
      db.contract.count({
        where: {
          estado: ContractStatus.vigente,
          fechaTermino: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.payroll.findMany({
        where: { estado: { in: [PayrollStatus.pagada, PayrollStatus.procesada] } },
        select: { liquido: true, totalHaberes: true },
      }),
      db.contract.findMany({
        where: { estado: ContractStatus.vigente },
        select: { sueldoBase: true },
      }),
    ]);

    const costoNominaTotal = payrollsMes.reduce((s, p) => s + p.liquido, 0);
    const promedioSueldo =
      sueldos.length > 0
        ? Math.round(sueldos.reduce((a, c) => a + c.sueldoBase, 0) / sueldos.length)
        : 0;

    return {
      totalEmpleados,
      empleadosActivos,
      empleadosInactivos,
      contratosVigentes,
      contratosPorTerminar,
      costoNominaTotal,
      promedioSueldo,
      rotacionPersonal: 0,
    };
  },
};
