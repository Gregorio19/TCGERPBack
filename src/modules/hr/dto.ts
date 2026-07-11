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

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora debe ser HH:mm');
const yyyyMmDdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD');

export const scheduleTemplateIdParamDto = z.object({
  templateId: z.string().uuid(),
});

export const scheduleExceptionIdParamDto = z.object({
  exceptionId: z.string().uuid(),
});

export const createScheduleTemplateDto = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    effectiveFrom: yyyyMmDdSchema,
    effectiveTo: yyyyMmDdSchema.optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startTime >= val.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime debe ser mayor a startTime',
      });
    }
    if (val.effectiveTo && val.effectiveTo < val.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveTo'],
        message: 'effectiveTo no puede ser menor que effectiveFrom',
      });
    }
  });

export const updateScheduleTemplateDto = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: hhmmSchema.optional(),
    endTime: hhmmSchema.optional(),
    effectiveFrom: yyyyMmDdSchema.optional(),
    effectiveTo: yyyyMmDdSchema.optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startTime && val.endTime && val.startTime >= val.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime debe ser mayor a startTime',
      });
    }
  });

export const listScheduleTemplatesQueryDto = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const listScheduleExceptionsQueryDto = z
  .object({
    from: yyyyMmDdSchema,
    to: yyyyMmDdSchema,
  })
  .superRefine((val, ctx) => {
    if (val.to < val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to no puede ser menor que from',
      });
    }
  });

export const scheduleCalendarQueryDto = listScheduleExceptionsQueryDto;

export const scheduleCalendarBulkQueryDto = z
  .object({
    from: yyyyMmDdSchema,
    to: yyyyMmDdSchema,
    estado: z.enum(['activo', 'inactivo', 'suspendido', 'licencia']).optional(),
    employeeIds: z
      .string()
      .transform((v) => v.split(',').map((x) => x.trim()).filter(Boolean))
      .optional(),
    branchId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.to < val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to no puede ser menor que from',
      });
    }
  });

export const createScheduleExceptionDto = z
  .object({
    date: yyyyMmDdSchema,
    type: z.enum(['override', 'off']),
    startTime: hhmmSchema.optional(),
    endTime: hhmmSchema.optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'off') {
      if (val.startTime || val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startTime'],
          message: 'En type=off no se permiten startTime/endTime',
        });
      }
      return;
    }
    if (!val.startTime || !val.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startTime'],
        message: 'En type=override startTime y endTime son obligatorios',
      });
      return;
    }
    if (val.startTime >= val.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime debe ser mayor a startTime',
      });
    }
  });

export const updateScheduleExceptionDto = z
  .object({
    date: yyyyMmDdSchema.optional(),
    type: z.enum(['override', 'off']).optional(),
    startTime: hhmmSchema.optional(),
    endTime: hhmmSchema.optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'off') {
      if (val.startTime || val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startTime'],
          message: 'En type=off no se permiten startTime/endTime',
        });
      }
      return;
    }
    if (val.startTime && val.endTime && val.startTime >= val.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime debe ser mayor a startTime',
      });
    }
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
  montoCitaBruta: z.number().int().nonnegative().optional().nullable(),
  montoCitaTotal: z.number().int().nonnegative().optional().nullable(),
  datosBancarios: datosBancariosSchema.optional(),
  previsional: previsionalSchema.optional(),
});

export const updateEmployeeDto = z.object({
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'licencia']).optional(),
  cargoId: z.string().uuid().nullable().optional(),
  montoCitaBruta: z.number().int().nonnegative().optional().nullable(),
  montoCitaTotal: z.number().int().nonnegative().optional().nullable(),
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
