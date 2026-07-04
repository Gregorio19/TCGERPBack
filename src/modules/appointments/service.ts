import { Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { hrService } from '../hr/service.js';

type OverlapInput = { startAt: Date; endAt: Date };

const appointmentInclude = {
  employee: { include: { position: true } },
  customer: true,
  serviceType: true,
} as const;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

const ACTIVE_APPOINTMENT_STATUSES = ['tentative', 'confirmed'] as const;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function asDate(v: string | Date) {
  return v instanceof Date ? v : new Date(v);
}

function assertValidRange(startAt: Date, endAt: Date) {
  if (!(endAt > startAt)) {
    throw new AppError(ErrorCodes.INVALID_RANGE, 'endAt debe ser mayor a startAt', 422);
  }
  if (startAt.getUTCMinutes() % 15 !== 0 || endAt.getUTCMinutes() % 15 !== 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Los horarios deben alinearse a grilla de 15 minutos', 422);
  }
}

function overlaps(a: OverlapInput, b: OverlapInput) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

function buildDateFromDayAndTime(dateKey: string, hhmm: string) {
  return new Date(`${dateKey}T${hhmm}:00.000Z`);
}

function customerDisplayName(c: { nombre: string; apellido: string }) {
  return `${c.nombre} ${c.apellido}`.trim();
}

function employeeDisplayName(e: { nombre: string; apellidoPaterno: string; apellidoMaterno: string }) {
  return [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(' ').trim();
}

/** Respuesta calendar-ready: ids + nombres planos + snapshots para el front. */
function mapAppointmentToApi(r: AppointmentWithRelations) {
  const customerNombre = customerDisplayName(r.customer);
  const employeeNombre = employeeDisplayName(r.employee);
  return {
    id: r.id,
    customerId: r.customerId,
    employeeId: r.employeeId,
    serviceTypeId: r.serviceTypeId,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    source: r.source,
    note: r.note,
    customerNombre,
    employeeNombre,
    customerSnapshot: {
      id: r.customer.id,
      nombre: r.customer.nombre,
      apellido: r.customer.apellido,
      nombreCompleto: customerNombre,
    },
    employeeSnapshot: {
      id: r.employee.id,
      nombre: r.employee.nombre,
      apellidoPaterno: r.employee.apellidoPaterno,
      apellidoMaterno: r.employee.apellidoMaterno,
      nombreCompleto: employeeNombre,
      cargo: r.employee.position?.nombre ?? null,
    },
    ...(r.serviceType
      ? {
          serviceTypeName: r.serviceType.name,
        }
      : { serviceTypeName: null as string | null }),
  };
}

async function getAppointmentForApi(id: string): Promise<AppointmentWithRelations> {
  const row = await db.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!row) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Cita no encontrada', 404);
  }
  return row;
}

async function requireCustomer(customerId: string) {
  const exists = await db.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
  if (!exists) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, 'Cliente no encontrado', 404);
}

async function requireEmployee(employeeId: string) {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: { position: true },
  });
  if (!employee) throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, 'Empleado no encontrado', 404);
  return employee;
}

function isPgConstraintConflict(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2002' || err.code === 'P2004';
  }
  if (err instanceof Error) {
    return err.message.includes('appointments_employee_timeslot_excl') || err.message.includes('23P01');
  }
  return false;
}

async function resolveServiceType(serviceTypeId?: string) {
  if (!serviceTypeId) return null;
  const row = await db.appointmentServiceType.findFirst({
    where: { id: serviceTypeId, isActive: true },
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Tipo de servicio no encontrado/inactivo', 404);
  return row;
}

type OverbookingPolicyRow = {
  employeeId: string | null;
  serviceTypeId: string | null;
  startTime: string | null;
  endTime: string | null;
  dayOfWeek: number | null;
  maxParallel: number;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function policyMatchesSlot(
  policy: OverbookingPolicyRow,
  input: { employeeId: string; serviceTypeId: string | null; startAt: Date }
): boolean {
  const dateOnly = input.startAt.toISOString().slice(0, 10);
  const dayOfWeek = (input.startAt.getUTCDay() + 6) % 7;
  const hhmm = input.startAt.toISOString().slice(11, 16);
  const dateStart = new Date(`${dateOnly}T00:00:00.000Z`);

  if (!policy.isActive) return false;
  if (policy.effectiveFrom > dateStart) return false;
  if (policy.effectiveTo && policy.effectiveTo < dateStart) return false;
  if (policy.employeeId !== null && policy.employeeId !== input.employeeId) return false;
  if (policy.serviceTypeId !== null && policy.serviceTypeId !== input.serviceTypeId) return false;
  if (policy.dayOfWeek !== null && policy.dayOfWeek !== dayOfWeek) return false;
  if (policy.startTime !== null && policy.startTime > hhmm) return false;
  if (policy.endTime !== null && policy.endTime <= hhmm) return false;
  return true;
}

function pickMaxParallelFromPolicies(
  policies: OverbookingPolicyRow[],
  input: {
    employeeId: string;
    serviceTypeId?: string | null;
    startAt: Date;
    serviceTypeAllowsOverbooking: boolean;
  }
): number {
  const serviceTypeId = input.serviceTypeId ?? null;
  const policy = policies
    .filter((p) => policyMatchesSlot(p, { employeeId: input.employeeId, serviceTypeId, startAt: input.startAt }))
    .sort((a, b) => b.maxParallel - a.maxParallel)[0];
  if (!input.serviceTypeAllowsOverbooking && !policy) return 1;
  return Math.max(2, policy?.maxParallel ?? 2);
}

async function loadOverbookingPoliciesForRange(
  employeeIds: string[],
  from: string,
  to: string,
  serviceTypeId?: string | null
): Promise<OverbookingPolicyRow[]> {
  if (employeeIds.length === 0) return [];
  const fromDate = asDate(`${from}T00:00:00.000Z`);
  const toDate = asDate(`${to}T00:00:00.000Z`);
  return db.appointmentOverbookingPolicy.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: toDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }],
      AND: [
        { OR: [{ employeeId: null }, { employeeId: { in: employeeIds } }] },
        serviceTypeId
          ? { OR: [{ serviceTypeId: null }, { serviceTypeId }] }
          : { serviceTypeId: null },
      ],
    },
  });
}

async function resolveMaxParallel(input: {
  employeeId: string;
  serviceTypeId?: string | null;
  startAt: Date;
  serviceTypeAllowsOverbooking: boolean;
}) {
  const dateOnly = input.startAt.toISOString().slice(0, 10);
  const policies = await loadOverbookingPoliciesForRange(
    [input.employeeId],
    dateOnly,
    dateOnly,
    input.serviceTypeId
  );
  return pickMaxParallelFromPolicies(policies, input);
}

async function checkScheduleAvailability(
  employeeId: string,
  startAt: Date,
  endAt: Date
): Promise<{ ok: boolean; reason?: string }> {
  const date = startAt.toISOString().slice(0, 10);
  const days = await hrService.getEmployeeCalendar(employeeId, date, date);
  const day = days[0];
  if (!day || day.isOff || day.blocks.length === 0) {
    return { ok: false, reason: 'Fuera del horario del empleado' };
  }
  const inSomeBlock = day.blocks.some((b) => {
    const blockStart = buildDateFromDayAndTime(date, b.startTime);
    const blockEnd = buildDateFromDayAndTime(date, b.endTime);
    return startAt >= blockStart && endAt <= blockEnd;
  });
  return inSomeBlock ? { ok: true } : { ok: false, reason: 'Slot fuera de bloque disponible' };
}

async function countOverlaps(input: {
  employeeId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
}) {
  return db.appointment.count({
    where: {
      employeeId: input.employeeId,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
  });
}

export const appointmentsService = {
  async getAvailability(input: {
    from: string;
    to: string;
    durationMin: number;
    employeeIds?: string[];
    branchId?: string;
    serviceTypeId?: string;
  }) {
    if (input.durationMin % 15 !== 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'durationMin debe ser múltiplo de 15', 422);
    }
    const serviceType = await resolveServiceType(input.serviceTypeId);
    const employees = await db.employee.findMany({
      where: {
        deletedAt: null,
        ...(input.employeeIds && input.employeeIds.length > 0 ? { id: { in: input.employeeIds } } : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: { position: true },
      orderBy: [{ apellidoPaterno: 'asc' }, { nombre: 'asc' }],
    });

    const fromDate = asDate(`${input.from}T00:00:00.000Z`);
    const toDate = asDate(`${input.to}T00:00:00.000Z`);
    const toExclusive = new Date(toDate);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const activeAppointments = await db.appointment.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startAt: { lt: toExclusive },
        endAt: { gt: fromDate },
      },
      include: { serviceType: true },
    });
    const activeHolds = await db.appointmentHold.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        expiresAt: { gt: new Date() },
        startAt: { lt: toExclusive },
        endAt: { gt: fromDate },
      },
    });

    const employeeIds = employees.map((e) => e.id);
    const overbookingPolicies = await loadOverbookingPoliciesForRange(
      employeeIds,
      input.from,
      input.to,
      input.serviceTypeId
    );
    const serviceTypeAllowsOverbooking = serviceType?.allowOverbooking ?? false;

    const slots = await Promise.all(
      employees.map(async (employee) => {
        const days = await hrService.getEmployeeCalendar(employee.id, input.from, input.to);
        const employeeAppointments = activeAppointments.filter((a) => a.employeeId === employee.id);
        const employeeHolds = activeHolds.filter((h) => h.employeeId === employee.id);
        const out: Array<{
          employeeId: string;
          startAt: string;
          endAt: string;
          durationMin: number;
          isAvailable: boolean;
          reason?: string;
        }> = [];
        for (const day of days) {
          if (day.isOff) continue;
          for (const block of day.blocks) {
            const blockStart = buildDateFromDayAndTime(day.date, block.startTime);
            const blockEnd = buildDateFromDayAndTime(day.date, block.endTime);
            for (let cursor = blockStart.getTime(); cursor + input.durationMin * 60_000 <= blockEnd.getTime(); cursor += FIFTEEN_MIN_MS) {
              const slotStart = new Date(cursor);
              const slotEnd = new Date(cursor + input.durationMin * 60_000);
              const slot = { startAt: slotStart, endAt: slotEnd };
              let reason: string | undefined;

              const holdConflict = employeeHolds.some((h) =>
                overlaps(slot, { startAt: h.startAt, endAt: h.endAt })
              );
              if (holdConflict) reason = 'slot_en_hold';

              if (!reason) {
                const maxParallel = pickMaxParallelFromPolicies(overbookingPolicies, {
                  employeeId: employee.id,
                  serviceTypeId: input.serviceTypeId ?? null,
                  startAt: slotStart,
                  serviceTypeAllowsOverbooking,
                });
                const usedCapacity = employeeAppointments.filter((a) => {
                  const before = a.serviceType?.bufferBeforeMin ?? 0;
                  const after = a.serviceType?.bufferAfterMin ?? 0;
                  const expanded = {
                    startAt: new Date(a.startAt.getTime() - before * 60_000),
                    endAt: new Date(a.endAt.getTime() + after * 60_000),
                  };
                  return overlaps(slot, expanded);
                }).length;
                if (usedCapacity >= maxParallel) reason = 'sin_capacidad';
              }

              out.push({
                employeeId: employee.id,
                startAt: slotStart.toISOString(),
                endAt: slotEnd.toISOString(),
                durationMin: input.durationMin,
                isAvailable: !reason,
                ...(reason ? { reason } : {}),
              });
            }
          }
        }
        return out;
      })
    );

    return slots.flat();
  },

  async listAppointments(input: {
    from: string;
    to: string;
    employeeId?: string;
    customerId?: string;
    status?: string[];
  }) {
    const rows = await db.appointment.findMany({
      where: {
        startAt: { lt: new Date(input.to) },
        endAt: { gt: new Date(input.from) },
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.status && input.status.length > 0
          ? { status: { in: input.status as Array<(typeof ACTIVE_APPOINTMENT_STATUSES)[number] | 'cancelled' | 'completed' | 'no_show'> } }
          : {}),
      },
      include: appointmentInclude,
      orderBy: [{ startAt: 'asc' }],
    });

    return rows.map((r) => mapAppointmentToApi(r));
  },

  async createAppointment(input: {
    customerId: string;
    employeeId: string;
    serviceTypeId?: string;
    startAt: string;
    endAt?: string;
    durationMin?: number;
    source?: 'manual' | 'web' | 'phone' | 'whatsapp';
    note?: string;
    status?: 'tentative' | 'confirmed';
    createdByUserId: string;
    idempotencyKey?: string;
  }) {
    await Promise.all([requireCustomer(input.customerId), requireEmployee(input.employeeId)]);
    const serviceType = await resolveServiceType(input.serviceTypeId);
    const startAt = new Date(input.startAt);
    const durationMin = input.durationMin ?? (input.endAt ? Math.round((new Date(input.endAt).getTime() - startAt.getTime()) / 60_000) : undefined);
    if (!durationMin) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No se pudo resolver durationMin', 422);
    const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + durationMin * 60_000);
    assertValidRange(startAt, endAt);

    const scheduleCheck = await checkScheduleAvailability(input.employeeId, startAt, endAt);
    if (!scheduleCheck.ok) throw new AppError(ErrorCodes.CONFLICT_STATE, scheduleCheck.reason ?? 'Horario no disponible', 409);

    if (input.idempotencyKey) {
      const existing = await db.appointment.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
        include: appointmentInclude,
      });
      if (existing) return mapAppointmentToApi(existing);
    }

    const maxParallel = await resolveMaxParallel({
      employeeId: input.employeeId,
      serviceTypeId: input.serviceTypeId,
      startAt,
      serviceTypeAllowsOverbooking: serviceType?.allowOverbooking ?? false,
    });
    const overlapCount = await countOverlaps({ employeeId: input.employeeId, startAt, endAt });
    if (overlapCount >= maxParallel) {
      throw new AppError(ErrorCodes.CONFLICT_STATE, 'Slot no disponible para esa franja horaria', 409);
    }

    try {
      const created = await db.appointment.create({
        data: {
          customerId: input.customerId,
          employeeId: input.employeeId,
          serviceTypeId: input.serviceTypeId,
          startAt,
          endAt,
          durationMin,
          status: input.status ?? 'confirmed',
          source: input.source ?? 'manual',
          note: input.note,
          createdByUserId: input.createdByUserId,
          idempotencyKey: input.idempotencyKey,
          consumesCapacity: overlapCount === 0,
        },
        include: appointmentInclude,
      });
      return mapAppointmentToApi(created);
    } catch (err) {
      if (isPgConstraintConflict(err)) {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'El horario ya fue reservado por otro proceso', 409);
      }
      throw err;
    }
  },

  async rescheduleAppointment(
    id: string,
    input: { startAt: string; endAt?: string; durationMin?: number; employeeId?: string }
  ) {
    const current = await db.appointment.findUnique({ where: { id } });
    if (!current) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Cita no encontrada', 404);
    if (current.status === 'cancelled') throw new AppError(ErrorCodes.CONFLICT_STATE, 'No se puede reprogramar una cita cancelada', 409);

    const startAt = new Date(input.startAt);
    const durationMin = input.durationMin ?? (input.endAt ? Math.round((new Date(input.endAt).getTime() - startAt.getTime()) / 60_000) : current.durationMin);
    const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + durationMin * 60_000);
    const employeeId = input.employeeId ?? current.employeeId;
    assertValidRange(startAt, endAt);

    const serviceType = current.serviceTypeId ? await resolveServiceType(current.serviceTypeId) : null;
    const maxParallel = await resolveMaxParallel({
      employeeId,
      serviceTypeId: current.serviceTypeId,
      startAt,
      serviceTypeAllowsOverbooking: serviceType?.allowOverbooking ?? false,
    });
    const overlapCount = await countOverlaps({ employeeId, startAt, endAt, excludeAppointmentId: id });
    if (overlapCount >= maxParallel) {
      throw new AppError(ErrorCodes.CONFLICT_STATE, 'No hay disponibilidad para reprogramar', 409);
    }
    const scheduleCheck = await checkScheduleAvailability(employeeId, startAt, endAt);
    if (!scheduleCheck.ok) throw new AppError(ErrorCodes.CONFLICT_STATE, scheduleCheck.reason ?? 'Horario no disponible', 409);

    try {
      const updated = await db.appointment.update({
        where: { id },
        data: { startAt, endAt, durationMin, employeeId, consumesCapacity: overlapCount === 0 },
        include: appointmentInclude,
      });
      return mapAppointmentToApi(updated);
    } catch (err) {
      if (isPgConstraintConflict(err)) {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'Conflicto de horario al reprogramar', 409);
      }
      throw err;
    }
  },

  async cancelAppointment(id: string, reason: string) {
    const current = await db.appointment.findUnique({ where: { id } });
    if (!current) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Cita no encontrada', 404);
    if (current.status === 'cancelled') {
      return mapAppointmentToApi(await getAppointmentForApi(id));
    }
    const cancelled = await db.appointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
        consumesCapacity: false,
      },
      include: appointmentInclude,
    });
    return mapAppointmentToApi(cancelled);
  },

  async createHold(input: {
    employeeId: string;
    startAt: string;
    endAt: string;
    ttlMinutes: number;
    createdByUserId: string;
  }) {
    await requireEmployee(input.employeeId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    assertValidRange(startAt, endAt);
    const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);
    return db.appointmentHold.create({
      data: {
        employeeId: input.employeeId,
        startAt,
        endAt,
        expiresAt,
        createdByUserId: input.createdByUserId,
      },
    });
  },

  async createServiceType(input: {
    name: string;
    durationOptions: number[];
    bufferBeforeMin?: number;
    bufferAfterMin?: number;
    allowOverbooking?: boolean;
    isActive?: boolean;
  }) {
    return db.appointmentServiceType.create({
      data: {
        name: input.name,
        durationOptions: input.durationOptions as unknown as Prisma.InputJsonValue,
        bufferBeforeMin: input.bufferBeforeMin ?? 0,
        bufferAfterMin: input.bufferAfterMin ?? 0,
        allowOverbooking: input.allowOverbooking ?? false,
        isActive: input.isActive ?? true,
      },
    });
  },
};
