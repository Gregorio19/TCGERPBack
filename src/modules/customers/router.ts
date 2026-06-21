import { Hono, type Context } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createCustomerDto,
  updateCustomerDto,
  listCustomersQueryDto,
  customerIdParamDto,
  createCustomerVisitDto,
  listCustomerVisitsQueryDto,
  customerAttachmentIdParamDto,
  listCustomerAttachmentsQueryDto,
  customerVisitIdParamDto,
  customerVisitAttachmentIdParamDto,
  listCustomerVisitAttachmentsQueryDto,
} from './dto.js';
import { customerService } from './service.js';
import { customerAttachmentService } from './attachments-service.js';
import { customerVisitAttachmentService } from './visit-attachments-service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { buildContentDisposition } from '../../lib/attachments/content-disposition.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapCustomer } from '../../lib/mapper.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { isAttachmentStorageAvailable } from '../../lib/storage/index.js';
import type { AttachmentDownloadResult } from '../../lib/attachments/attachment-ops.js';
import { z } from 'zod';

function respondAttachmentDownload(
  c: Context,
  result: AttachmentDownloadResult,
  wantsJson: boolean
) {
  if (result.mode === 'body') {
    if (wantsJson) {
      const selfUrl = new URL(c.req.url);
      selfUrl.searchParams.set('inline', '1');
      return ok(c, { url: `${selfUrl.pathname}${selfUrl.search}` });
    }
    const disposition = buildContentDisposition(
      result.inline ? 'inline' : 'attachment',
      result.filename
    );
    return new Response(new Uint8Array(result.body), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': disposition,
        'Content-Length': String(result.body.length),
      },
    });
  }

  if (wantsJson) {
    return ok(c, { url: result.url });
  }
  return c.redirect(result.url, 302);
}

export const customersRouter = new Hono();

// Listar clientes
customersRouter.get(
  '/',
  optionalAuth,
  validateQuery(listCustomersQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listCustomersQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortOrder) queryRecord.sortOrder = query.sortOrder;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;
    if (query.q) queryRecord.q = query.q;

    const pagination = parsePagination(queryRecord);
    const filters = {
      estado: query.estado,
      canalComunicacion: query.canalComunicacion,
      recibirPromociones: query.recibirPromociones,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      region: query.region,
      ciudad: query.ciudad,
    };

    const result = await customerService.list({ ...pagination, ...filters });
    return ok(c, {
      ...result,
      data: result.data.map(mapCustomer),
    });
  }
);

// Crear cliente
customersRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createCustomerDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createCustomerDto>;
    const customer = await customerService.create(data);
    return created(c, mapCustomer(customer));
  }
);

// Historial de visitas / notas (antes de GET /:id por convención de rutas)
customersRouter.get(
  '/:id/visits',
  optionalAuth,
  validateParams(customerIdParamDto),
  validateQuery(listCustomerVisitsQueryDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const query = (c as any).get('validatedQuery') as z.infer<typeof listCustomerVisitsQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    const pagination = parsePagination(queryRecord);
    const result = await customerService.listVisits(id, pagination);
    return ok(c, result);
  }
);

customersRouter.post(
  '/:id/visits',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  validateBody(createCustomerVisitDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const body = (c as any).get('validatedBody') as z.infer<typeof createCustomerVisitDto>;
    const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
    const visit = await customerService.createVisit(id, user.userId, {
      descripcion: body.descripcion,
      ...(body.fecha !== undefined && { fecha: new Date(body.fecha) }),
    });
    return created(c, visit);
  }
);

// Adjuntos por visita (antes de adjuntos por cliente)
customersRouter.get(
  '/:id/visits/:visitId/attachments',
  optionalAuth,
  validateParams(customerVisitIdParamDto),
  validateQuery(listCustomerVisitAttachmentsQueryDto),
  async (c) => {
    const { id, visitId } = (c as any).get('validatedParams') as { id: string; visitId: string };
    const query = (c as any).get('validatedQuery') as z.infer<
      typeof listCustomerVisitAttachmentsQueryDto
    >;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    const pagination = parsePagination(queryRecord);
    const result = await customerVisitAttachmentService.list(id, visitId, pagination);
    return ok(c, result);
  }
);

customersRouter.post(
  '/:id/visits/:visitId/attachments',
  authJWT,
  rbacGuard,
  validateParams(customerVisitIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id, visitId } = (c as any).get('validatedParams') as { id: string; visitId: string };
    const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Campo file requerido (multipart)', 422, [
        { field: 'file', message: 'Archivo requerido' },
      ]);
    }
    const descripcionRaw = form.get('descripcion');
    const descripcion =
      typeof descripcionRaw === 'string' && descripcionRaw.trim()
        ? descripcionRaw.trim().slice(0, 500)
        : undefined;
    const attachment = await customerVisitAttachmentService.upload(
      id,
      visitId,
      user.userId,
      file,
      descripcion
    );
    return created(c, attachment);
  }
);

customersRouter.get(
  '/:id/visits/:visitId/attachments/:attachmentId/download',
  authJWT,
  rbacGuard,
  validateParams(customerVisitAttachmentIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id, visitId, attachmentId } = (c as any).get('validatedParams') as {
      id: string;
      visitId: string;
      attachmentId: string;
    };
    const accept = c.req.header('Accept') ?? '';
    const wantsJson = accept.includes('application/json');
    const inline = c.req.query('inline') === '1' || c.req.query('inline') === 'true';
    const result = await customerVisitAttachmentService.resolveDownload(
      id,
      visitId,
      attachmentId,
      { inline: inline || wantsJson }
    );
    return respondAttachmentDownload(c, result, wantsJson);
  }
);

customersRouter.delete(
  '/:id/visits/:visitId/attachments/:attachmentId',
  authJWT,
  rbacGuard,
  validateParams(customerVisitAttachmentIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id, visitId, attachmentId } = (c as any).get('validatedParams') as {
      id: string;
      visitId: string;
      attachmentId: string;
    };
    await customerVisitAttachmentService.delete(id, visitId, attachmentId);
    return noContent(c);
  }
);

// Adjuntos por cliente (antes de GET /:id)
customersRouter.get(
  '/:id/attachments',
  optionalAuth,
  validateParams(customerIdParamDto),
  validateQuery(listCustomerAttachmentsQueryDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const query = (c as any).get('validatedQuery') as z.infer<
      typeof listCustomerAttachmentsQueryDto
    >;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    const pagination = parsePagination(queryRecord);
    const result = await customerAttachmentService.list(id, pagination);
    return ok(c, result);
  }
);

customersRouter.post(
  '/:id/attachments',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id } = (c as any).get('validatedParams') as { id: string };
    const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Campo file requerido (multipart)', 422, [
        { field: 'file', message: 'Archivo requerido' },
      ]);
    }
    const descripcionRaw = form.get('descripcion');
    const descripcion =
      typeof descripcionRaw === 'string' && descripcionRaw.trim()
        ? descripcionRaw.trim().slice(0, 500)
        : undefined;
    const attachment = await customerAttachmentService.upload(id, user.userId, file, descripcion);
    return created(c, attachment);
  }
);

customersRouter.get(
  '/:id/attachments/:attachmentId/download',
  authJWT,
  rbacGuard,
  validateParams(customerAttachmentIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id, attachmentId } = (c as any).get('validatedParams') as {
      id: string;
      attachmentId: string;
    };
    const accept = c.req.header('Accept') ?? '';
    const wantsJson = accept.includes('application/json');
    const inline = c.req.query('inline') === '1' || c.req.query('inline') === 'true';
    const result = await customerAttachmentService.resolveDownload(id, attachmentId, {
      inline: inline || wantsJson,
    });

    return respondAttachmentDownload(c, result, wantsJson);
  }
);

customersRouter.delete(
  '/:id/attachments/:attachmentId',
  authJWT,
  rbacGuard,
  validateParams(customerAttachmentIdParamDto),
  async (c) => {
    if (!isAttachmentStorageAvailable()) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        'Almacenamiento de adjuntos no configurado (variables S3/R2)',
        503
      );
    }
    const { id, attachmentId } = (c as any).get('validatedParams') as {
      id: string;
      attachmentId: string;
    };
    await customerAttachmentService.delete(id, attachmentId);
    return noContent(c);
  }
);

// Obtener cliente por ID
customersRouter.get(
  '/:id',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const params = (c as any).get('validatedParams') as { id: string };
    const customer = await customerService.getById(params.id);
    return ok(c, mapCustomer(customer));
  }
);

// Actualizar cliente
customersRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  validateBody(updateCustomerDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateCustomerDto>;
    const customer = await customerService.update(id, data);
    return ok(c, mapCustomer(customer));
  }
);

// Eliminar cliente
customersRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await customerService.delete(id);
    return noContent(c);
  }
);

// Órdenes de un cliente
customersRouter.get(
  '/:id/orders',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const orders = await customerService.getOrders(id);
    return ok(c, orders);
  }
);

// Estadísticas de cliente
customersRouter.get(
  '/:id/stats',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const stats = await customerService.getStats(id);
    return ok(c, stats);
  }
);

