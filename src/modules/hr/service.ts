import {
  ContractStatus,
  PayrollStatus,
  Prisma,
  ScheduleExceptionType,
} from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { normalizeRut, validateRut } from '../../lib/rut-validator.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import {
  mapContrato,
  mapCargo,
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

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function blocksOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function parseDateOnly(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`);
}

function dateOnlyKey(input: Date) {
  return input.toISOString().slice(0, 10);
}

function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null
) {
  const aEnd = aTo ?? new Date('9999-12-31T00:00:00.000Z');
  const bEnd = bTo ?? new Date('9999-12-31T00:00:00.000Z');
  return aFrom <= bEnd && bFrom <= aEnd;
}

function dayOfWeekFromDate(date: Date): number {
  // JS getUTCDay(): 0 domingo..6 sábado; usamos lunes=0..domingo=6
  const d = date.getUTCDay();
  return (d + 6) % 7;
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
    montoCitaBruta?: number | null;
    montoCitaTotal?: number | null;
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
          montoCitaBruta: input.montoCitaBruta ?? undefined,
          montoCitaTotal: input.montoCitaTotal ?? undefined,
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
      montoCitaBruta?: number | null;
      montoCitaTotal?: number | null;
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
          ...(input.montoCitaBruta !== undefined ? { montoCitaBruta: input.montoCitaBruta } : {}),
          ...(input.montoCitaTotal !== undefined ? { montoCitaTotal: input.montoCitaTotal } : {}),
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

  async createScheduleTemplate(
    employeeId: string,
    input: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      isActive?: boolean;
    }
  ) {
    await requireEmployee(employeeId);
    const effectiveFrom = parseDateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? parseDateOnly(input.effectiveTo) : null;

    const existing = await db.employeeScheduleTemplate.findMany({
      where: { employeeId, dayOfWeek: input.dayOfWeek, isActive: true },
    });
    for (const row of existing) {
      if (
        blocksOverlap(input.startTime, input.endTime, row.startTime, row.endTime) &&
        dateRangesOverlap(effectiveFrom, effectiveTo, row.effectiveFrom, row.effectiveTo)
      ) {
        throw new AppError(
          ErrorCodes.CONFLICT_STATE,
          'El bloque horario se solapa con otro bloque del mismo día',
          409
        );
      }
    }

    return db.employeeScheduleTemplate.create({
      data: {
        employeeId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        effectiveFrom,
        effectiveTo,
        isActive: input.isActive ?? true,
      },
    });
  },

  async listScheduleTemplates(
    employeeId: string,
    filters: {
      dayOfWeek?: number;
      isActive?: boolean;
    }
  ) {
    await requireEmployee(employeeId);
    return db.employeeScheduleTemplate.findMany({
      where: {
        employeeId,
        ...(filters.dayOfWeek !== undefined ? { dayOfWeek: filters.dayOfWeek } : {}),
        ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  async updateScheduleTemplate(
    templateId: string,
    input: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      effectiveFrom?: string;
      effectiveTo?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await db.employeeScheduleTemplate.findUnique({ where: { id: templateId } });
    if (!existing) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Bloque horario no encontrado', 404);
    }

    const next = {
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
      effectiveFrom: input.effectiveFrom ? parseDateOnly(input.effectiveFrom) : existing.effectiveFrom,
      effectiveTo:
        input.effectiveTo !== undefined
          ? input.effectiveTo
            ? parseDateOnly(input.effectiveTo)
            : null
          : existing.effectiveTo,
      isActive: input.isActive ?? existing.isActive,
    };

    if (next.isActive) {
      const peers = await db.employeeScheduleTemplate.findMany({
        where: {
          employeeId: existing.employeeId,
          dayOfWeek: next.dayOfWeek,
          isActive: true,
          id: { not: existing.id },
        },
      });
      for (const row of peers) {
        if (
          blocksOverlap(next.startTime, next.endTime, row.startTime, row.endTime) &&
          dateRangesOverlap(next.effectiveFrom, next.effectiveTo, row.effectiveFrom, row.effectiveTo)
        ) {
          throw new AppError(
            ErrorCodes.CONFLICT_STATE,
            'El bloque horario se solapa con otro bloque del mismo día',
            409
          );
        }
      }
    }

    return db.employeeScheduleTemplate.update({
      where: { id: existing.id },
      data: next,
    });
  },

  async deleteScheduleTemplate(templateId: string) {
    const existing = await db.employeeScheduleTemplate.findUnique({ where: { id: templateId } });
    if (!existing) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Bloque horario no encontrado', 404);
    }
    await db.employeeScheduleTemplate.delete({ where: { id: templateId } });
  },

  async createScheduleException(
    employeeId: string,
    input: {
      date: string;
      type: 'override' | 'off';
      startTime?: string;
      endTime?: string;
      note?: string;
    }
  ) {
    await requireEmployee(employeeId);
    const date = parseDateOnly(input.date);
    const dateStart = date;
    const dateEnd = new Date(dateStart);
    dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

    const sameDateRows = await db.employeeScheduleException.findMany({
      where: {
        employeeId,
        date: {
          gte: dateStart,
          lt: dateEnd,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (input.type === 'off') {
      if (sameDateRows.length > 0) {
        throw new AppError(
          ErrorCodes.CONFLICT_STATE,
          'Ya existen excepciones para ese día; no se puede marcar off',
          409
        );
      }
    } else {
      const hasOff = sameDateRows.some((r) => r.type === ScheduleExceptionType.off);
      if (hasOff) {
        throw new AppError(
          ErrorCodes.CONFLICT_STATE,
          'El día está marcado como no laborable (off)',
          409
        );
      }
      for (const row of sameDateRows) {
        if (
          row.type === ScheduleExceptionType.override &&
          row.startTime &&
          row.endTime &&
          input.startTime &&
          input.endTime &&
          blocksOverlap(input.startTime, input.endTime, row.startTime, row.endTime)
        ) {
          throw new AppError(
            ErrorCodes.CONFLICT_STATE,
            'La excepción se solapa con otro bloque override del mismo día',
            409
          );
        }
      }
    }

    return db.employeeScheduleException.create({
      data: {
        employeeId,
        date,
        type: input.type as ScheduleExceptionType,
        startTime: input.type === 'override' ? input.startTime : null,
        endTime: input.type === 'override' ? input.endTime : null,
        note: input.note,
      },
    });
  },

  async listScheduleExceptions(employeeId: string, input: { from: string; to: string }) {
    await requireEmployee(employeeId);
    const from = parseDateOnly(input.from);
    const to = parseDateOnly(input.to);
    const toInclusive = new Date(to);
    toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

    return db.employeeScheduleException.findMany({
      where: {
        employeeId,
        date: {
          gte: from,
          lt: toInclusive,
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  },

  async updateScheduleException(
    exceptionId: string,
    input: {
      date?: string;
      type?: 'override' | 'off';
      startTime?: string;
      endTime?: string;
      note?: string;
    }
  ) {
    const existing = await db.employeeScheduleException.findUnique({ where: { id: exceptionId } });
    if (!existing) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Excepción de horario no encontrada', 404);
    }

    const nextType = (input.type ?? existing.type) as ScheduleExceptionType;
    const nextDate = input.date ? parseDateOnly(input.date) : existing.date;
    const nextStart =
      nextType === ScheduleExceptionType.override ? input.startTime ?? existing.startTime : null;
    const nextEnd = nextType === ScheduleExceptionType.override ? input.endTime ?? existing.endTime : null;

    const dateStart = nextDate;
    const dateEnd = new Date(dateStart);
    dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

    const peers = await db.employeeScheduleException.findMany({
      where: {
        employeeId: existing.employeeId,
        id: { not: existing.id },
        date: {
          gte: dateStart,
          lt: dateEnd,
        },
      },
    });

    if (nextType === ScheduleExceptionType.off) {
      if (peers.length > 0) {
        throw new AppError(
          ErrorCodes.CONFLICT_STATE,
          'No se puede marcar off: ya existen otros bloques en ese día',
          409
        );
      }
    } else {
      const hasOff = peers.some((r) => r.type === ScheduleExceptionType.off);
      if (hasOff) {
        throw new AppError(
          ErrorCodes.CONFLICT_STATE,
          'El día está marcado como no laborable (off)',
          409
        );
      }
      for (const row of peers) {
        if (
          row.type === ScheduleExceptionType.override &&
          row.startTime &&
          row.endTime &&
          nextStart &&
          nextEnd &&
          blocksOverlap(nextStart, nextEnd, row.startTime, row.endTime)
        ) {
          throw new AppError(
            ErrorCodes.CONFLICT_STATE,
            'La excepción se solapa con otro bloque override del mismo día',
            409
          );
        }
      }
    }

    return db.employeeScheduleException.update({
      where: { id: existing.id },
      data: {
        date: nextDate,
        type: nextType,
        startTime: nextStart,
        endTime: nextEnd,
        note: input.note ?? existing.note,
      },
    });
  },

  async deleteScheduleException(exceptionId: string) {
    const existing = await db.employeeScheduleException.findUnique({ where: { id: exceptionId } });
    if (!existing) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Excepción de horario no encontrada', 404);
    }
    await db.employeeScheduleException.delete({ where: { id: exceptionId } });
  },

  async getEmployeeCalendar(employeeId: string, from: string, to: string) {
    await requireEmployee(employeeId);
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    const toExclusive = new Date(toDate);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const [templates, exceptions] = await Promise.all([
      db.employeeScheduleTemplate.findMany({
        where: {
          employeeId,
          isActive: true,
          effectiveFrom: { lte: toDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }],
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      db.employeeScheduleException.findMany({
        where: {
          employeeId,
          date: { gte: fromDate, lt: toExclusive },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const excByDate = new Map<string, typeof exceptions>();
    for (const row of exceptions) {
      const key = dateOnlyKey(row.date);
      const list = excByDate.get(key) ?? [];
      list.push(row);
      excByDate.set(key, list);
    }

    const out: Array<{
      date: string;
      employeeId: string;
      isOff: boolean;
      blocks: Array<{ startTime: string; endTime: string }>;
      source: 'template' | 'exception_override' | 'exception_off';
      note?: string;
    }> = [];

    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const dateKey = dateOnlyKey(cursor);
      const dateExceptions = excByDate.get(dateKey) ?? [];
      const off = dateExceptions.find((e) => e.type === ScheduleExceptionType.off);
      if (off) {
        out.push({
          date: dateKey,
          employeeId,
          isOff: true,
          blocks: [],
          source: 'exception_off',
          ...(off.note ? { note: off.note } : {}),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const overrides = dateExceptions
        .filter((e) => e.type === ScheduleExceptionType.override && e.startTime && e.endTime)
        .map((e) => ({ startTime: e.startTime!, endTime: e.endTime!, note: e.note ?? undefined }));

      if (overrides.length > 0) {
        out.push({
          date: dateKey,
          employeeId,
          isOff: false,
          blocks: overrides.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
          source: 'exception_override',
          ...(overrides[0]?.note ? { note: overrides[0].note } : {}),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const dow = dayOfWeekFromDate(cursor);
      const tBlocks = templates
        .filter((t) => {
          if (t.dayOfWeek !== dow) return false;
          if (cursor < t.effectiveFrom) return false;
          if (t.effectiveTo && cursor > t.effectiveTo) return false;
          return true;
        })
        .map((t) => ({ startTime: t.startTime, endTime: t.endTime }));

      if (tBlocks.length > 0) {
        out.push({
          date: dateKey,
          employeeId,
          isOff: false,
          blocks: tBlocks,
          source: 'template',
        });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return out;
  },

  async getSchedulesCalendarBulk(input: {
    from: string;
    to: string;
    estado?: 'activo' | 'inactivo' | 'suspendido' | 'licencia';
    employeeIds?: string[];
    branchId?: string;
  }) {
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
    if (input.estado) where.estado = input.estado;
    if (input.employeeIds && input.employeeIds.length > 0) where.id = { in: input.employeeIds };
    if (input.branchId) where.branchId = input.branchId;

    const employees = await db.employee.findMany({
      where,
      include: { position: true },
      orderBy: [{ apellidoPaterno: 'asc' }, { nombre: 'asc' }],
    });

    const calendarByEmployee = await Promise.all(
      employees.map(async (e) => {
        const days = await this.getEmployeeCalendar(e.id, input.from, input.to);
        return {
          employeeId: e.id,
          employee: {
            id: e.id,
            nombre: e.nombre,
            apellidoPaterno: e.apellidoPaterno,
            apellidoMaterno: e.apellidoMaterno,
            estado: e.estado,
            cargo: e.position ? mapCargo(e.position) : null,
          },
          days,
        };
      })
    );

    return calendarByEmployee;
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
