import { ContractStatus, PayrollStatus, Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { buildPaginatedResponse, type PaginationParams } from '../../lib/pagination.js';
import { mapContributionSummary, mapNomina, type EmployeeWithRelations, type PayrollWithRelations } from './mapper.js';
import { employeeInclude, requireEmployee } from './employees.service.js';
import { ensureHrParams } from './parameters.service.js';

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

function descuentosAfpSaludAfcMutual(
  calc: { descuentosAFP: number; descuentosSalud: number; descuentosAFC: number; descuentosMutual: number },
  _params: { porcentajeAFP: number; porcentajeSalud: number; porcentajeAFC: number; porcentajeMutual: number }
) {
  return calc.descuentosAFP + calc.descuentosSalud + calc.descuentosAFC + calc.descuentosMutual;
}

export const payrollService = {
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
};
