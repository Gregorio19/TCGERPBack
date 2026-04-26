import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateParams, validateQuery } from '../../lib/validation.js';
import { created, ok } from '../../lib/responses.js';
import {
  appointmentIdParamDto,
  availabilityQueryDto,
  cancelAppointmentDto,
  createAppointmentDto,
  createHoldDto,
  createServiceTypeDto,
  listAppointmentsQueryDto,
  rescheduleAppointmentDto,
} from './dto.js';
import { appointmentsService } from './service.js';

export const appointmentsRouter = new Hono();

appointmentsRouter.get(
  '/availability',
  optionalAuth,
  validateQuery(availabilityQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof availabilityQueryDto>;
    const data = await appointmentsService.getAvailability(query);
    return ok(c, data);
  }
);

appointmentsRouter.get(
  '/',
  optionalAuth,
  validateQuery(listAppointmentsQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listAppointmentsQueryDto>;
    const data = await appointmentsService.listAppointments(query);
    return ok(c, data);
  }
);

appointmentsRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createAppointmentDto),
  async (c) => {
    const body = (c as any).get('validatedBody') as z.infer<typeof createAppointmentDto>;
    const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
    const idempotencyKey = c.req.header('Idempotency-Key') ?? undefined;
    const data = await appointmentsService.createAppointment({
      ...body,
      createdByUserId: user.userId,
      idempotencyKey,
    });
    return created(c, data);
  }
);

appointmentsRouter.patch(
  '/:id/reschedule',
  authJWT,
  rbacGuard,
  validateParams(appointmentIdParamDto),
  validateBody(rescheduleAppointmentDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as z.infer<typeof appointmentIdParamDto>;
    const body = (c as any).get('validatedBody') as z.infer<typeof rescheduleAppointmentDto>;
    const data = await appointmentsService.rescheduleAppointment(id, body);
    return ok(c, data);
  }
);

appointmentsRouter.patch(
  '/:id/cancel',
  authJWT,
  rbacGuard,
  validateParams(appointmentIdParamDto),
  validateBody(cancelAppointmentDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as z.infer<typeof appointmentIdParamDto>;
    const body = (c as any).get('validatedBody') as z.infer<typeof cancelAppointmentDto>;
    const data = await appointmentsService.cancelAppointment(id, body.reason);
    return ok(c, data);
  }
);

appointmentsRouter.post(
  '/holds',
  authJWT,
  rbacGuard,
  validateBody(createHoldDto),
  async (c) => {
    const body = (c as any).get('validatedBody') as z.infer<typeof createHoldDto>;
    const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
    const data = await appointmentsService.createHold({
      ...body,
      createdByUserId: user.userId,
    });
    return created(c, data);
  }
);

appointmentsRouter.post(
  '/service-types',
  authJWT,
  rbacGuard,
  validateBody(createServiceTypeDto),
  async (c) => {
    const body = (c as any).get('validatedBody') as z.infer<typeof createServiceTypeDto>;
    const data = await appointmentsService.createServiceType(body);
    return created(c, data);
  }
);
