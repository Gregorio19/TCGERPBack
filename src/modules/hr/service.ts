import {
  ContractStatus,
  PayrollStatus,
  Prisma,
} from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { normalizeRut, validateRut } from '../../lib/rut-validator.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import {
  mapContrato,
  mapContributionSummary,
  mapEmpleado,
  mapNomina,
  mapParametros,
  type ContractWithRelations,
  type EmployeeWithRelations,
  type PayrollWithRelations,
} from './mapper.js';

/** Incluye el contrato en estado `vigente` (máx. 1 por empleado) para listados y detalle. */
const employeeInclude = {
  position: true,
  bankData: true,
  socialSecurity: true,
  contracts: {
    where: { estado: ContractStatus.vigente },
    take: 1,
  },
} as const;

async function requireEmployee(id: string): Promise<EmployeeWithRelations> {
  const e = await db.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!e) {
    throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, 'Empleado no encontrado', 404);
  }
  return e as EmployeeWithRelations;
}

async function ensureHrParams() {
  const row = await db.hrCalculationParameters.findUnique({ where: { id: 'default' } });
  if (row) return row;
  return db.hrCalculationParameters.create({
    data: {
      id: 'default',
      porcentajeAFP: 10,
      porcentajeSalud: 7,
      porcentajeAFC: 0.6,
      porcentajeMutual: 0.93,
      tramoImpuesto: 'tramo_1',
      porcentajeImpuesto: 4,
      rebajaImpuesto: 12000,
    },
  });
}

async function calcularLiquidacionCore(employeeId: string, _periodo: string) {
  await ensureHrParams();
  const params = await db.hrCalculationParameters.findUnique({ where: { id: 'default' } });
  if (!params) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Parámetros RRHH no configurados', 500);
  }

  await requireEmployee(employeeId);
  const contract = await db.contract.findFirst({
    where: { employeeId, estado: ContractStatus.vigente },
  });
  if (!contract) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'No hay contrato vigente para el empleado', 422);
  }

  const sueldoBase = contract.sueldoBase;
  const horasExtra = 0;
  const gratificacion = 0;
  const otrosHaberes = 0;
  const totalHaberes = sueldoBase + horasExtra + gratificacion + otrosHaberes;

  const descuentosAFP = Math.round((totalHaberes * params.porcentajeAFP) / 100);
  const descuentosSalud = Math.round((totalHaberes * params.porcentajeSalud) / 100);
  const descuentosAFC = Math.round((totalHaberes * params.porcentajeAFC) / 100);
  const descuentosMutual = Math.round((totalHaberes * params.porcentajeMutual) / 100);
  const impuestos = Math.max(
    0,
    Math.round((totalHaberes * params.porcentajeImpuesto) / 100) - params.rebajaImpuesto
  );
  const otrosDescuentos = 0;
  const totalDescuentos =
    descuentosAFP + descuentosSalud + descuentosAFC + descuentosMutual + impuestos + otrosDescuentos;
  const liquido = totalHaberes - totalDescuentos;

  return {
    sueldoBase,
    horasExtra,
    gratificacion,
    otrosHaberes,
    totalHaberes,
    descuentosAFP,
    descuentosSalud,
    descuentosAFC,
    descuentosMutual,
    impuestos,
    otrosDescuentos,
    totalDescuentos,
    liquido,
  };
}

function nextContractNumber(year: number, seq: number) {
  return `CT-${year}-${String(seq).padStart(4, '0')}`;
}

/** JSON guardado en `employee_contribution_summaries.afp`: nombre según ficha previsional del empleado. */
function buildContributionAfpJson(
  emp: EmployeeWithRelations,
  base: number,
  params: { porcentajeAFP: number },
  montoAfp: number
) {
  const s = emp.socialSecurity;
  const afpSlug = s?.afp?.trim() ? s.afp.trim().toLowerCase() : 'no_definida';
  return {
    afp: afpSlug,
    baseImponible: base,
    porcentaje: params.porcentajeAFP,
    monto: montoAfp,
  };
}

/** JSON guardado en `employee_contribution_summaries.salud`: fonasa / isapre según ficha. */
function buildContributionSaludJson(
  emp: EmployeeWithRelations,
  base: number,
  params: { porcentajeSalud: number },
  montoSalud: number
) {
  const s = emp.socialSecurity;
  const tipo = s?.salud?.trim() ? s.salud.trim().toLowerCase() : 'fonasa';
  const out: Record<string, unknown> = {
    tipo,
    baseImponible: base,
    porcentaje: params.porcentajeSalud,
    monto: montoSalud,
  };
  if (tipo === 'isapre' && s?.isapre && String(s.isapre).trim() !== '') {
    out.isapre = s.isapre;
  }
  return out;
}

export const hrService = {
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

  async calcularLiquidacion(employeeId: string, periodo: string) {
    return calcularLiquidacionCore(employeeId, periodo);
  },

  async generarNomina(input: { periodo: string; empleadoIds?: string[]; incluirTodos?: boolean }) {
    const params = await ensureHrParams();
    const whereEmp: Prisma.EmployeeWhereInput = { deletedAt: null, estado: 'activo' };
    if (input.empleadoIds?.length && !input.incluirTodos) {
      whereEmp.id = { in: input.empleadoIds };
    }

    const empleados = await db.employee.findMany({
      where: whereEmp,
      include: employeeInclude,
    });

    const out: ReturnType<typeof mapNomina>[] = [];
    const lastDay = new Date(`${input.periodo}-01T12:00:00.000Z`);
    const fechaGen = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);

    for (const emp of empleados) {
      const contract = await db.contract.findFirst({
        where: { employeeId: emp.id, estado: ContractStatus.vigente },
      });
      if (!contract) continue;

      const calc = await calcularLiquidacionCore(emp.id, input.periodo);
      const payrollRow = await db.$transaction(async (tx) => {
        const existing = await tx.payroll.findUnique({
          where: { employeeId_periodo: { employeeId: emp.id, periodo: input.periodo } },
        });
        if (existing && existing.estado === PayrollStatus.pagada) {
          return null;
        }

        const p = await tx.payroll.upsert({
          where: { employeeId_periodo: { employeeId: emp.id, periodo: input.periodo } },
          create: {
            employeeId: emp.id,
            contractId: contract.id,
            periodo: input.periodo,
            sueldoBase: calc.sueldoBase,
            totalHaberes: calc.totalHaberes,
            totalDescuentos: calc.totalDescuentos,
            totalImposiciones: descuentosAfpSaludAfcMutual(calc, params),
            liquido: calc.liquido,
            estado: PayrollStatus.pendiente,
            fechaGeneracion: fechaGen,
            observaciones: '',
          },
          update: {
            sueldoBase: calc.sueldoBase,
            totalHaberes: calc.totalHaberes,
            totalDescuentos: calc.totalDescuentos,
            totalImposiciones: descuentosAfpSaludAfcMutual(calc, params),
            liquido: calc.liquido,
            fechaGeneracion: fechaGen,
            contractId: contract.id,
          },
        });

        await tx.payrollEarning.deleteMany({ where: { payrollId: p.id } });
        await tx.payrollDeduction.deleteMany({ where: { payrollId: p.id } });
        await tx.payrollImpositionLine.deleteMany({ where: { payrollId: p.id } });

        await tx.payrollEarning.create({
          data: {
            payrollId: p.id,
            tipo: 'sueldo_base',
            descripcion: 'Sueldo Base',
            monto: calc.sueldoBase,
            esImponible: true,
            esTributable: true,
          },
        });
        await tx.payrollDeduction.create({
          data: {
            payrollId: p.id,
            tipo: 'afp',
            descripcion: 'AFP',
            porcentaje: params.porcentajeAFP,
            monto: calc.descuentosAFP,
            esLegal: true,
            esVoluntario: false,
          },
        });
        await tx.payrollImpositionLine.createMany({
          data: [
            {
              payrollId: p.id,
              tipo: 'AFP',
              descripcion: 'AFP',
              porcentaje: params.porcentajeAFP,
              baseImponible: calc.totalHaberes,
              monto: calc.descuentosAFP,
              esObligatoria: true,
            },
            {
              payrollId: p.id,
              tipo: 'Salud',
              descripcion: 'Salud',
              porcentaje: params.porcentajeSalud,
              baseImponible: calc.totalHaberes,
              monto: calc.descuentosSalud,
              esObligatoria: true,
            },
          ],
        });

        return tx.payroll.findUniqueOrThrow({
          where: { id: p.id },
          include: {
            employee: { include: employeeInclude },
            contract: true,
            earnings: true,
            deductions: true,
            impositionLines: true,
          },
        });
      });

      if (payrollRow) {
        out.push(mapNomina(payrollRow as PayrollWithRelations));
      }
    }

    return out;
  },

  async listPayroll(
    pagination: PaginationParams & { periodo?: string; estado?: string; empleadoId?: string }
  ) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const where: Prisma.PayrollWhereInput = {};
    if (pagination.periodo) where.periodo = pagination.periodo;
    if (pagination.estado) where.estado = pagination.estado as PayrollStatus;
    if (pagination.empleadoId) where.employeeId = pagination.empleadoId;

    const [rows, total] = await Promise.all([
      db.payroll.findMany({
        where,
        include: {
          employee: { include: employeeInclude },
          contract: true,
          earnings: true,
          deductions: true,
          impositionLines: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.payroll.count({ where }),
    ]);

    const data = rows.map((p) => mapNomina(p as PayrollWithRelations));
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getPayrollById(id: string) {
    const p = await db.payroll.findUnique({
      where: { id },
      include: {
        employee: { include: employeeInclude },
        contract: true,
        earnings: true,
        deductions: true,
        impositionLines: true,
      },
    });
    if (!p) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Nómina no encontrada', 404);
    }
    return mapNomina(p as PayrollWithRelations);
  },

  async payrollByPeriodo(periodo: string) {
    const rows = await db.payroll.findMany({
      where: { periodo },
      include: {
        employee: { include: employeeInclude },
        contract: true,
        earnings: true,
        deductions: true,
        impositionLines: true,
      },
    });
    return rows.map((p) => mapNomina(p as PayrollWithRelations));
  },

  async procesarNomina(input: { nominaId: string; fechaPago: string; observaciones?: string }) {
    const p = await db.payroll.findUnique({ where: { id: input.nominaId } });
    if (!p) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Nómina no encontrada', 404);
    }
    if (p.estado === PayrollStatus.pagada) {
      throw new AppError(ErrorCodes.CONFLICT_STATE, 'La nómina ya está pagada', 409);
    }
    const updated = await db.payroll.update({
      where: { id: input.nominaId },
      data: {
        estado: PayrollStatus.pagada,
        fechaPago: new Date(input.fechaPago),
        observaciones: input.observaciones ?? p.observaciones,
      },
      include: {
        employee: { include: employeeInclude },
        contract: true,
        earnings: true,
        deductions: true,
        impositionLines: true,
      },
    });
    return mapNomina(updated as PayrollWithRelations);
  },

  async resumenNomina(periodo: string) {
    const rows = await db.payroll.findMany({ where: { periodo } });
    const totalEmpleados = rows.length;
    const totalHaberes = rows.reduce((s, r) => s + r.totalHaberes, 0);
    const totalDescuentos = rows.reduce((s, r) => s + r.totalDescuentos, 0);
    const totalImposiciones = rows.reduce((s, r) => s + r.totalImposiciones, 0);
    const totalLiquido = rows.reduce((s, r) => s + r.liquido, 0);
    const empleadosPagados = rows.filter((r) => r.estado === PayrollStatus.pagada).length;
    const empleadosPendientes = rows.filter((r) => r.estado !== PayrollStatus.pagada).length;

    return {
      periodo,
      totalEmpleados,
      totalHaberes,
      totalDescuentos,
      totalImposiciones,
      totalLiquido,
      empleadosPagados,
      empleadosPendientes,
    };
  },

  async exportNominaCsv(input: { periodo: string; incluirDetalle?: boolean; incluirImposiciones?: boolean }) {
    const rows = await db.payroll.findMany({
      where: { periodo: input.periodo },
      include: { employee: true },
    });
    const header = ['periodo', 'empleadoId', 'rut', 'nombre', 'liquido', 'estado'].join(';');
    const lines = rows.map((r) =>
      [
        r.periodo,
        r.employeeId,
        r.employee.rut,
        r.employee.nombre,
        r.liquido,
        r.estado,
      ].join(';')
    );
    return [header, ...lines].join('\n');
  },

  async listContributionSummaries(
    pagination: PaginationParams & { periodo?: string; tipo?: string; empleadoId?: string }
  ) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const where: Prisma.EmployeeContributionSummaryWhereInput = {};
    if (pagination.periodo) where.periodo = pagination.periodo;
    if (pagination.empleadoId) where.employeeId = pagination.empleadoId;

    const [rows, total] = await Promise.all([
      db.employeeContributionSummary.findMany({
        where,
        include: { employee: { include: employeeInclude } },
        orderBy: { fechaGeneracion: 'desc' },
        skip,
        take: pageSize,
      }),
      db.employeeContributionSummary.count({ where }),
    ]);

    const data = rows.map((r) =>
      mapContributionSummary({ ...r, employee: r.employee as EmployeeWithRelations })
    );
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getContributionSummaryById(id: string) {
    const r = await db.employeeContributionSummary.findUnique({
      where: { id },
      include: { employee: { include: employeeInclude } },
    });
    if (!r) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Imposición no encontrada', 404);
    }
    return mapContributionSummary({ ...r, employee: r.employee as EmployeeWithRelations });
  },

  async contributionsByPeriodo(periodo: string) {
    const rows = await db.employeeContributionSummary.findMany({
      where: { periodo },
      include: { employee: { include: employeeInclude } },
    });
    return rows.map((r) =>
      mapContributionSummary({ ...r, employee: r.employee as EmployeeWithRelations })
    );
  },

  async generarContributions(input: { periodo: string; empleadoIds?: string[] }) {
    const params = await ensureHrParams();
    const whereEmp: Prisma.EmployeeWhereInput = { deletedAt: null };
    if (input.empleadoIds?.length) {
      whereEmp.id = { in: input.empleadoIds };
    }
    const empleados = await db.employee.findMany({ where: whereEmp, include: employeeInclude });

    const lastDay = new Date(`${input.periodo}-01T12:00:00.000Z`);
    const fechaGen = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0);

    const out: ReturnType<typeof mapContributionSummary>[] = [];

    for (const emp of empleados) {
      const calc = await calcularLiquidacionCore(emp.id, input.periodo);
      const base = calc.totalHaberes;
      const montoAfp = calc.descuentosAFP;
      const montoSalud = calc.descuentosSalud;
      const montoAfc = calc.descuentosAFC;
      const montoMutual = calc.descuentosMutual;
      const totalImp = montoAfp + montoSalud + montoAfc + montoMutual;

      const afp = buildContributionAfpJson(emp, base, params, montoAfp);
      const salud = buildContributionSaludJson(emp, base, params, montoSalud);
      const afc = { baseImponible: base, porcentaje: params.porcentajeAFC, monto: montoAfc };
      const mutual = { baseImponible: base, porcentaje: params.porcentajeMutual, monto: montoMutual };

      const row = await db.employeeContributionSummary.upsert({
        where: {
          employeeId_periodo: { employeeId: emp.id, periodo: input.periodo },
        },
        create: {
          employeeId: emp.id,
          periodo: input.periodo,
          fechaGeneracion: fechaGen,
          totalImposiciones: totalImp,
          afp: afp as Prisma.InputJsonValue,
          salud: salud as Prisma.InputJsonValue,
          afc: afc as Prisma.InputJsonValue,
          mutual: mutual as Prisma.InputJsonValue,
        },
        update: {
          fechaGeneracion: fechaGen,
          totalImposiciones: totalImp,
          afp: afp as Prisma.InputJsonValue,
          salud: salud as Prisma.InputJsonValue,
          afc: afc as Prisma.InputJsonValue,
          mutual: mutual as Prisma.InputJsonValue,
        },
        include: { employee: { include: employeeInclude } },
      });

      out.push(
        mapContributionSummary({
          ...row,
          employee: (row as { employee: EmployeeWithRelations }).employee,
        })
      );
    }

    return out;
  },

  async exportContributionsCsv(input: { periodo: string }) {
    const rows = await db.employeeContributionSummary.findMany({
      where: { periodo: input.periodo },
      include: { employee: true },
    });
    const header = ['periodo', 'empleadoId', 'rut', 'totalImposiciones'].join(';');
    const lines = rows.map((r) =>
      [r.periodo, r.employeeId, r.employee.rut, r.totalImposiciones].join(';')
    );
    return [header, ...lines].join('\n');
  },

  async listPositions() {
    return db.position.findMany({ orderBy: { nombre: 'asc' } });
  },

  async getPositionById(id: string) {
    const p = await db.position.findUnique({ where: { id } });
    if (!p) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Cargo no encontrado', 404);
    }
    return p;
  },

  async getParametros() {
    const p = await ensureHrParams();
    return mapParametros(p);
  },

  async updateParametros(data: {
    porcentajeAFP: number;
    porcentajeSalud: number;
    porcentajeAFC: number;
    porcentajeMutual: number;
    tramoImpuesto: string;
    porcentajeImpuesto: number;
    rebajaImpuesto: number;
  }) {
    const p = await db.hrCalculationParameters.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return mapParametros(p);
  },
};

function descuentosAfpSaludAfcMutual(
  calc: { descuentosAFP: number; descuentosSalud: number; descuentosAFC: number; descuentosMutual: number },
  _params: { porcentajeAFP: number; porcentajeSalud: number; porcentajeAFC: number; porcentajeMutual: number }
) {
  return calc.descuentosAFP + calc.descuentosSalud + calc.descuentosAFC + calc.descuentosMutual;
}
