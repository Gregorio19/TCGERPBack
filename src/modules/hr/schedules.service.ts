import { Prisma, ScheduleExceptionType } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { mapCargo } from './mapper.js';
import { requireEmployee } from './employees.service.js';

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

export const schedulesService = {
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
};
