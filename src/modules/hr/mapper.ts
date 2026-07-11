import type {
  Employee,
  Position,
  Contract,
  Payroll,
  PayrollEarning,
  PayrollDeduction,
  PayrollImpositionLine,
  EmployeeBankData,
  EmployeeSocialSecurity,
  EmployeeContributionSummary,
  HrCalculationParameters,
} from '@prisma/client';
import { normalizeRut } from '../../lib/rut-validator.js';

export type EmployeeWithRelations = Employee & {
  position: Position | null;
  bankData: EmployeeBankData | null;
  socialSecurity: EmployeeSocialSecurity | null;
  contracts?: Contract[];
};

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatIsoDateTime(d: Date): string {
  return d.toISOString();
}

export function mapCargo(p: Position) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    departamento: p.departamento,
    nivelJerarquico: p.nivelJerarquico,
    sueldoMinimo: p.sueldoMinimo,
    sueldoMaximo: p.sueldoMaximo,
  };
}

export function mapDatosBancarios(b: EmployeeBankData) {
  return {
    banco: b.banco,
    tipoCuenta: b.tipoCuenta,
    numeroCuenta: b.numeroCuenta,
    rutTitular: normalizeRut(b.rutTitular) ?? b.rutTitular,
  };
}

export function mapPrevisional(s: EmployeeSocialSecurity) {
  return {
    afp: s.afp,
    salud: s.salud,
    ...(s.isapre != null && s.isapre !== '' ? { isapre: s.isapre } : {}),
    mutual: s.mutual,
    afc: s.afc,
    ...(s.porcentajeAFC != null ? { porcentajeAFC: s.porcentajeAFC } : {}),
  };
}

export function mapDireccion(json: unknown): Record<string, string> | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  return {
    calle: String(o.calle ?? ''),
    numero: String(o.numero ?? ''),
    comuna: String(o.comuna ?? ''),
    region: String(o.region ?? ''),
    ...(o.codigoPostal != null ? { codigoPostal: String(o.codigoPostal) } : {}),
  };
}

/** Resumen del contrato vigente para listados de empleados (tipo + sueldo, etc.). */
export function mapContratoVigenteResumen(c: Contract) {
  return {
    id: c.id,
    tipo: c.tipo,
    jornada: c.jornada ?? 'completa',
    sueldoBase: c.sueldoBase,
    estado: c.estado,
    fechaInicio: formatDateOnly(c.fechaInicio),
    fechaFin: c.fechaTermino ? formatDateOnly(c.fechaTermino) : null,
  };
}

export function mapEmpleado(e: EmployeeWithRelations) {
  const rut = normalizeRut(e.rut) ?? e.rut;
  const vigente = e.contracts?.[0];
  /** Forma estable para el front (API_RRHH_CONSUMIDA_POR_FRONTEND): siempre las mismas claves; `null` si no hay dato en BD. */
  return {
    id: e.id,
    rut,
    nombre: e.nombre,
    apellidoPaterno: e.apellidoPaterno,
    apellidoMaterno: e.apellidoMaterno,
    email: e.email,
    telefono: e.telefono ?? null,
    fechaNacimiento: formatDateOnly(e.fechaNacimiento),
    fechaIngreso: formatDateOnly(e.fechaIngreso),
    estado: e.estado,
    direccion: e.direccion != null ? mapDireccion(e.direccion) : null,
    cargo: e.position ? mapCargo(e.position) : null,
    datosBancarios: e.bankData ? mapDatosBancarios(e.bankData) : null,
    previsional: e.socialSecurity ? mapPrevisional(e.socialSecurity) : null,
    fechaCreacion: formatIsoDateTime(e.createdAt),
    fechaActualizacion: formatIsoDateTime(e.updatedAt),
    /** Contrato activo (`vigente`): tipo, sueldo base, etc. `null` si no tiene. */
    contratoVigente: vigente ? mapContratoVigenteResumen(vigente) : null,
    montoCitaBruta: e.montoCitaBruta ?? null,
    montoCitaTotal: e.montoCitaTotal ?? null,
  };
}

export type ContractWithRelations = Contract & {
  employee: EmployeeWithRelations;
};

export function mapContrato(c: ContractWithRelations) {
  const emp = mapEmpleado(c.employee);
  return {
    id: c.id,
    empleadoId: c.employeeId,
    empleado: emp,
    numeroContrato: c.numeroContrato ?? '',
    tipo: c.tipo,
    jornada: c.jornada ?? 'completa',
    sueldoBase: c.sueldoBase,
    fechaInicio: formatDateOnly(c.fechaInicio),
    fechaFin: c.fechaTermino ? formatDateOnly(c.fechaTermino) : null,
    estado: c.estado,
    observaciones: c.observaciones ?? '',
    fechaCreacion: formatIsoDateTime(c.createdAt),
    fechaActualizacion: formatIsoDateTime(c.updatedAt),
  };
}

export type PayrollWithRelations = Payroll & {
  employee: EmployeeWithRelations;
  contract: Contract | null;
  earnings: PayrollEarning[];
  deductions: PayrollDeduction[];
  impositionLines: PayrollImpositionLine[];
};

export function mapNomina(p: PayrollWithRelations) {
  const emp = mapEmpleado(p.employee);
  const contratoMapped = p.contract
    ? mapContrato({
        ...p.contract,
        employee: p.employee,
      } as ContractWithRelations)
    : null;

  return {
    id: p.id,
    periodo: p.periodo,
    empleadoId: p.employeeId,
    empleado: emp,
    contratoId: p.contractId ?? null,
    contrato: contratoMapped,
    fechaGeneracion: p.fechaGeneracion ? formatDateOnly(p.fechaGeneracion) : null,
    fechaPago: p.fechaPago ? formatDateOnly(p.fechaPago) : null,
    estado: p.estado,
    haberes: p.earnings.map((h) => ({
      id: h.id,
      tipo: h.tipo,
      descripcion: h.descripcion,
      monto: h.monto,
      esImponible: h.esImponible,
      esTributable: h.esTributable,
    })),
    descuentos: p.deductions.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      descripcion: d.descripcion,
      porcentaje: d.porcentaje,
      monto: d.monto,
      esLegal: d.esLegal,
      esVoluntario: d.esVoluntario,
    })),
    imposiciones: p.impositionLines.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      descripcion: i.descripcion,
      porcentaje: i.porcentaje,
      baseImponible: i.baseImponible,
      monto: i.monto,
      esObligatoria: i.esObligatoria,
    })),
    totalHaberes: p.totalHaberes,
    totalDescuentos: p.totalDescuentos,
    totalImposiciones: p.totalImposiciones,
    liquido: p.liquido,
    observaciones: p.observaciones ?? '',
  };
}

export function mapContributionSummary(
  row: EmployeeContributionSummary & { employee: EmployeeWithRelations }
) {
  return {
    id: row.id,
    periodo: row.periodo,
    empleadoId: row.employeeId,
    empleado: mapEmpleado(row.employee),
    afp: row.afp as Record<string, unknown>,
    salud: row.salud as Record<string, unknown>,
    afc: row.afc as Record<string, unknown>,
    mutual: row.mutual as Record<string, unknown>,
    totalImposiciones: row.totalImposiciones,
    fechaGeneracion: formatDateOnly(row.fechaGeneracion),
  };
}

export function mapParametros(p: HrCalculationParameters) {
  return {
    porcentajeAFP: p.porcentajeAFP,
    porcentajeSalud: p.porcentajeSalud,
    porcentajeAFC: p.porcentajeAFC,
    porcentajeMutual: p.porcentajeMutual,
    tramoImpuesto: p.tramoImpuesto,
    porcentajeImpuesto: p.porcentajeImpuesto,
    rebajaImpuesto: p.rebajaImpuesto,
  };
}
