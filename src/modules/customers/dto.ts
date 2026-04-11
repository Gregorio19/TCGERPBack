import { z } from 'zod';
import { uuidSchema, emailSchema } from '../../lib/validation.js';
import { validateRut, normalizeRut } from '../../lib/rut-validator.js';

// Enum para estado de cliente
export const CustomerStatusEnum = z.enum(['activo', 'inactivo', 'suspendido']);

// Schema para dirección (objeto JSON)
export const addressSchema = z.object({
  calle: z.string().min(1).max(200),
  numero: z.string().optional(),
  comuna: z.string().min(1).max(100),
  ciudad: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  codigoPostal: z.string().optional(),
}).passthrough(); // Permite campos adicionales

// Schema para RUT con validación de dígito verificador
const rutWithValidation = z.string()
  .regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, {
    message: 'RUT inválido (formato: 12.345.678-9)',
  })
  .refine(
    (rut) => {
      try {
        return validateRut(rut);
      } catch (error) {
        return false;
      }
    },
    {
      message: 'RUT inválido: el dígito verificador no es correcto',
    }
  )
  .transform((rut) => {
    try {
      const normalized = normalizeRut(rut);
      return normalized || rut;
    } catch (error) {
      return rut;
    }
  });

// Schema para teléfono chileno
const phoneSchema = z.string()
  .regex(/^\+?56\s?9?\s?\d{4}\s?\d{4}$/, {
    message: 'Teléfono inválido (formato: +56 9 1234 5678 o 56912345678)',
  });

// DTO para crear cliente
export const createCustomerDto = z.object({
  nombre: z.string().min(1).max(100, { message: 'Nombre debe tener máximo 100 caracteres' }),
  apellido: z.string().min(1).max(100, { message: 'Apellido debe tener máximo 100 caracteres' }),
  email: emailSchema,
  telefono: phoneSchema,
  rut: rutWithValidation,
  direccion: addressSchema,
  estado: CustomerStatusEnum.optional().default('activo'),
});

// DTO para actualizar cliente
export const updateCustomerDto = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  email: emailSchema.optional(),
  telefono: phoneSchema.optional(),
  rut: rutWithValidation.optional(),
  direccion: addressSchema.optional(),
  estado: CustomerStatusEnum.optional(),
}).strict();

// DTO para query de listado
export const listCustomersQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  estado: z.string().optional(),
  canalComunicacion: z.string().optional(),
  recibirPromociones: z.string().transform((val) => val === 'true').optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  region: z.string().optional(),
  ciudad: z.string().optional(),
});

// DTO para parámetro de ID
export const customerIdParamDto = z.object({
  id: uuidSchema,
});

/** Visita/nota: texto largo tal cual (sin trim); fecha del hecho opcional (ISO 8601). */
export const createCustomerVisitDto = z.object({
  descripcion: z.string().min(1).max(50000),
  fecha: z.string().datetime({ offset: true }).optional(),
});

export const listCustomerVisitsQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
});

