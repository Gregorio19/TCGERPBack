import { Hono, type Context } from 'hono';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { getValidated, validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createCustomerDto,
  updateCustomerDto,
  listCustomersQueryDto,
  customerIdParamDto,
  createCustomerVisitDto,
  updateCustomerVisitDto,
  listCustomerVisitsQueryDto,
  customerAttachmentIdParamDto,
  listCustomerAttachmentsQueryDto,
  customerVisitIdParamDto,
  customerVisitAttachmentIdParamDto,
  listCustomerVisitAttachmentsQueryDto,
} from './dto.js';
import { createPurchase, createPurchaseDto, listPurchases } from './purchases.js';
import { getStoreCredit } from './store-credit.js';
import { parseCustomersListQuery, customerService } from './service.js';
import { customerAttachmentService } from './attachments-service.js';
import { customerVisitAttachmentService } from './visit-attachments-service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { buildContentDisposition } from '../../lib/attachments/content-disposition.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapCustomer } from '../../lib/mapper.js';
import { parseAttachmentForm, requireAttachmentStorage } from './attachment-service-core.js';
import type { AttachmentDownloadResult } from '../../lib/attachments/attachment-ops.js';

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
  authJWT,
  rbacGuard,
  validateQuery(listCustomersQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listCustomersQueryDto);
    const result = await customerService.list(parseCustomersListQuery(query));
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
    const data = getValidated(c, 'validatedBody', createCustomerDto);
    const customer = await customerService.create(data);
    return created(c, mapCustomer(customer));
  }
);

// Historial de visitas / notas (antes de GET /:id por convención de rutas)
customersRouter.get(
  '/:id/visits',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  validateQuery(listCustomerVisitsQueryDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const query = getValidated(c, 'validatedQuery', listCustomerVisitsQueryDto);
    const pagination = parsePagination(query);
    const result = await customerService.listVisits(id, pagination, query.tipo);
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
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const body = getValidated(c, 'validatedBody', createCustomerVisitDto);
    const user = getAuthUser(c);
    const visit = await customerService.createVisit(id, user.userId, body);
    return created(c, visit);
  }
);

customersRouter.patch(
  '/:id/visits/:visitId',
  authJWT,
  rbacGuard,
  validateParams(customerVisitIdParamDto),
  validateBody(updateCustomerVisitDto),
  async (c) => {
    const { id, visitId } = getValidated(c, 'validatedParams', customerVisitIdParamDto);
    const body = getValidated(c, 'validatedBody', updateCustomerVisitDto);
    const visit = await customerService.updateVisit(id, visitId, body);
    return ok(c, visit);
  }
);

// Adjuntos por visita (antes de adjuntos por cliente)
customersRouter.get(
  '/:id/visits/:visitId/attachments',
  authJWT,
  rbacGuard,
  validateParams(customerVisitIdParamDto),
  validateQuery(listCustomerVisitAttachmentsQueryDto),
  async (c) => {
    const { id, visitId } = getValidated(c, 'validatedParams', customerVisitIdParamDto);
    const query = getValidated(c, 'validatedQuery', listCustomerVisitAttachmentsQueryDto);
    const pagination = parsePagination(query);
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
    requireAttachmentStorage();
    const { id, visitId } = getValidated(c, 'validatedParams', customerVisitIdParamDto);
    const user = getAuthUser(c);
    const { file, descripcion } = parseAttachmentForm(await c.req.formData());
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
    requireAttachmentStorage();
    const { id, visitId, attachmentId } = getValidated(c, 'validatedParams', customerVisitAttachmentIdParamDto);
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
    requireAttachmentStorage();
    const { id, visitId, attachmentId } = getValidated(c, 'validatedParams', customerVisitAttachmentIdParamDto);
    await customerVisitAttachmentService.delete(id, visitId, attachmentId);
    return noContent(c);
  }
);

// Adjuntos por cliente (antes de GET /:id)
customersRouter.get(
  '/:id/attachments',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  validateQuery(listCustomerAttachmentsQueryDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const query = getValidated(c, 'validatedQuery', listCustomerAttachmentsQueryDto);
    const pagination = parsePagination(query);
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
    requireAttachmentStorage();
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const user = getAuthUser(c);
    const { file, descripcion } = parseAttachmentForm(await c.req.formData());
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
    requireAttachmentStorage();
    const { id, attachmentId } = getValidated(c, 'validatedParams', customerAttachmentIdParamDto);
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
    requireAttachmentStorage();
    const { id, attachmentId } = getValidated(c, 'validatedParams', customerAttachmentIdParamDto);
    await customerAttachmentService.delete(id, attachmentId);
    return noContent(c);
  }
);

// Obtener cliente por ID
customersRouter.get(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    const params = getValidated(c, 'validatedParams', customerIdParamDto);
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
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const data = getValidated(c, 'validatedBody', updateCustomerDto);
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
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    await customerService.delete(id);
    return noContent(c);
  }
);

// Órdenes de un cliente
customersRouter.get(
  '/:id/orders',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const orders = await customerService.getOrders(id);
    return ok(c, orders);
  }
);

// Estadísticas de cliente
customersRouter.get(
  '/:id/stats',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const stats = await customerService.getStats(id);
    return ok(c, stats);
  }
);


customersRouter.get('/:id/store-credit', authJWT, rbacGuard, validateParams(customerIdParamDto), async (c) => {
  const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
  return ok(c, await getStoreCredit(id));
});

customersRouter.get('/:id/purchases', authJWT, rbacGuard, validateParams(customerIdParamDto), async (c) => {
  const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
  return ok(c, await listPurchases(id));
});

customersRouter.post(
  '/:id/purchases', authJWT, rbacGuard, validateParams(customerIdParamDto), validateBody(createPurchaseDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', customerIdParamDto);
    const input = getValidated(c, 'validatedBody', createPurchaseDto);
    return created(c, await createPurchase(id, getAuthUser(c).userId, input));
  }
);
