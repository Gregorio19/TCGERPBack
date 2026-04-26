import { z } from 'zod';
import { uuidSchema } from '../../lib/validation.js';

const yyyyMmDdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });

const durationSchema = z
  .number()
  .int()
  .refine((n) => n % 15 === 0, { message: 'durationMin debe ser múltiplo de 15' })
  .refine((n) => [15, 30, 45, 60].includes(n), { message: 'durationMin no permitido' });

const csvToArray = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .optional();

const optionalUuidQuery = z.preprocess((v) => {
  if (typeof v === 'string' && v.trim() === '') return undefined;
  return v;
}, uuidSchema.optional());

export const availabilityQueryDto = z.object({
  from: yyyyMmDdSchema,
  to: yyyyMmDdSchema,
  durationMin: z.coerce.number().int().refine((n) => n % 15 === 0),
  employeeIds: csvToArray,
  branchId: uuidSchema.optional(),
  serviceTypeId: uuidSchema.optional(),
});

export const listAppointmentsQueryDto = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  employeeId: optionalUuidQuery,
  customerId: optionalUuidQuery,
  status: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .optional(),
});

const appointmentSourceInput = z.preprocess(
  (v) => (v === 'web_agenda' ? 'web' : v),
  z.enum(['manual', 'web', 'phone', 'whatsapp']).optional()
);

export const createAppointmentDto = z
  .object({
    customerId: uuidSchema,
    employeeId: uuidSchema,
    serviceTypeId: uuidSchema.optional(),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema.optional(),
    durationMin: durationSchema.optional(),
    source: appointmentSourceInput,
    note: z.string().max(50000).optional(),
    status: z.enum(['tentative', 'confirmed']).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.endAt && !val.durationMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe enviar endAt o durationMin',
        path: ['durationMin'],
      });
    }
  });

export const rescheduleAppointmentDto = z
  .object({
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema.optional(),
    durationMin: durationSchema.optional(),
    employeeId: uuidSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.endAt && !val.durationMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe enviar endAt o durationMin',
        path: ['durationMin'],
      });
    }
  });

export const cancelAppointmentDto = z.object({
  reason: z.string().min(1).max(500),
});

export const appointmentIdParamDto = z.object({
  id: uuidSchema,
});

export const createServiceTypeDto = z.object({
  name: z.string().min(1).max(120),
  durationOptions: z
    .array(z.number().int().positive().refine((n) => n % 15 === 0))
    .min(1),
  bufferBeforeMin: z.number().int().min(0).max(120).optional(),
  bufferAfterMin: z.number().int().min(0).max(120).optional(),
  allowOverbooking: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createHoldDto = z.object({
  employeeId: uuidSchema,
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  ttlMinutes: z.number().int().min(1).max(30).default(5),
});
