import { z } from 'zod';

const periodoSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Periodo debe ser YYYY-MM');

export const direccionSchema = z.object({
  calle: z.string(),
  numero: z.string(),
  comuna: z.string(),
  region: z.string(),
  codigoPostal: z.string().optional(),
});

export const datosBancariosSchema = z.object({
  banco: z.string(),
  tipoCuenta: z.string(),
  numeroCuenta: z.string(),
  rutTitular: z.string(),
});

export const previsionalSchema = z.object({
  afp: z.string(),
  salud: z.string(),
  isapre: z.string().optional(),
  mutual: z.boolean().optional(),
  afc: z.boolean().optional(),
  porcentajeAFC: z.number().optional(),
});

export const listEmployeesQueryDto = z.object({
  page: z.coerce.string().optional(),
  limit: z.coerce.string().optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'licencia']).optional(),
  cargo: z.string().optional(),
  departamento: z.string().optional(),
  fechaIngresoDesde: z.string().optional(),
  fechaIngresoHasta: z.string().optional(),
  busqueda: z.string().optional(),
});

export const employeeIdParamDto = z.object({
  id: z.string().uuid(),
});

export const createEmployeeDto = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  apellidoPaterno: z.string().min(1),
  apellidoMaterno: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
  fechaNacimiento: z.string(),
  direccion: direccionSchema.optional(),
  cargoId: z.string().uuid().optional(),
  datosBancarios: datosBancariosSchema.optional(),
  previsional: previsionalSchema.optional(),
});

export const updateEmployeeDto = z.object({
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'licencia']).optional(),
  cargoId: z.string().uuid().nullable().optional(),
  direccion: direccionSchema.optional(),
  datosBancarios: datosBancariosSchema.optional(),
  previsional: previsionalSchema.optional(),
});

export const listContractsQueryDto = z.object({
  page: z.coerce.string().optional(),
  limit: z.coerce.string().optional(),
  estado: z.enum(['vigente', 'respaldo', 'terminado', 'suspendido']).optional(),
  tipo: z.string().optional(),
  empleadoId: z.string().uuid().optional(),
  search: z.string().optional(),
  q: z.string().optional(),
});

export const contractIdParamDto = z.object({
  id: z.string().uuid(),
});

export const empleadoIdContractParamDto = z.object({
  empleadoId: z.string().uuid(),
});

export const createContractDto = z.object({
  empleadoId: z.string().uuid(),
  tipo: z.string(),
  jornada: z.string().optional(),
  sueldoBase: z.number().int().positive(),
  fechaInicio: z.string(),
  fechaFin: z.string().nullable().optional(),
  observaciones: z.string().optional(),
});

export const updateContractDto = z.object({
  sueldoBase: z.number().int().positive().optional(),
  observaciones: z.string().optional(),
  jornada: z.string().optional(),
  tipo: z.string().optional(),
  fechaFin: z.string().nullable().optional(),
});

export const terminarContractDto = z.object({
  fechaTermino: z.string(),
  observaciones: z.string().optional(),
});

export const listPayrollQueryDto = z.object({
  page: z.coerce.string().optional(),
  limit: z.coerce.string().optional(),
  periodo: z.string().optional(),
  estado: z.enum(['pendiente', 'procesada', 'pagada', 'cancelada']).optional(),
  empleadoId: z.string().uuid().optional(),
});

export const payrollIdParamDto = z.object({
  id: z.string().uuid(),
});

export const periodoParamDto = z.object({
  periodo: periodoSchema,
});

export const generarNominaDto = z.object({
  periodo: periodoSchema,
  empleadoIds: z.array(z.string().uuid()).optional(),
  incluirTodos: z.boolean().optional(),
});

export const procesarNominaDto = z.object({
  nominaId: z.string().uuid(),
  fechaPago: z.string(),
  observaciones: z.string().optional(),
});

export const calcularNominaDto = z.object({
  empleadoId: z.string().uuid(),
  periodo: periodoSchema,
});

export const exportarNominaDto = z.object({
  periodo: periodoSchema,
  formato: z.enum(['csv', 'xlsx']).default('csv'),
  incluirDetalle: z.boolean().optional(),
  incluirImposiciones: z.boolean().optional(),
});

export const listContributionsQueryDto = z.object({
  page: z.coerce.string().optional(),
  limit: z.coerce.string().optional(),
  periodo: z.string().optional(),
  tipo: z.string().optional(),
  empleadoId: z.string().uuid().optional(),
});

export const contributionIdParamDto = z.object({
  id: z.string().uuid(),
});

export const generarContributionsDto = z.object({
  periodo: periodoSchema,
  empleadoIds: z.array(z.string().uuid()).optional(),
});

export const exportarContributionsDto = z.object({
  periodo: periodoSchema,
  formato: z.enum(['csv', 'excel']).default('csv'),
  tipo: z.enum(['todos', 'afp', 'salud']).default('todos'),
});

export const positionIdParamDto = z.object({
  id: z.string().uuid(),
});

export const parametrosCalculoDto = z.object({
  porcentajeAFP: z.number(),
  porcentajeSalud: z.number(),
  porcentajeAFC: z.number(),
  porcentajeMutual: z.number(),
  tramoImpuesto: z.string(),
  porcentajeImpuesto: z.number(),
  rebajaImpuesto: z.number().int(),
});
