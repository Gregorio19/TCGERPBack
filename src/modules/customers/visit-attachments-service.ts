import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import type { PaginationParams } from '../../lib/pagination.js';
import { mapUploadedBy, type AttachmentDownloadResult } from '../../lib/attachments/attachment-ops.js';
import { attachmentUploaderInclude, createAttachmentService } from './attachment-service-core.js';
import { customerService } from './service.js';

function buildStorageKey(
  customerId: string,
  visitId: string,
  attachmentId: string,
  filename: string
): string {
  return `customers/${customerId}/visits/${visitId}/${attachmentId}/${filename}`;
}

export function mapVisitAttachment(
  customerId: string,
  visitId: string,
  row: {
    id: string;
    originalName: string;
    mimeType: string;
    originalSizeBytes: number;
    storedSizeBytes: number;
    descripcion: string | null;
    createdAt: Date;
    uploadedBy: { nombre: string; username: string };
  }
) {
  return {
    id: row.id,
    visitId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    originalSizeBytes: row.originalSizeBytes,
    storedSizeBytes: row.storedSizeBytes,
    descripcion: row.descripcion,
    createdAt: row.createdAt,
    uploadedBy: mapUploadedBy(row.uploadedBy),
    downloadPath: `/api/customers/${customerId}/visits/${visitId}/attachments/${row.id}/download`,
  };
}

async function getVisitForCustomer(customerId: string, visitId: string) {
  await customerService.getById(customerId);
  const visit = await db.customerVisit.findFirst({
    where: { id: visitId, customerId },
  });
  if (!visit) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Visita no encontrada', 404);
  }
  return visit;
}

type VisitOwner = { customerId: string; visitId: string };

const attachments = createAttachmentService({
  requireOwner: ({ customerId, visitId }: VisitOwner) => getVisitForCustomer(customerId, visitId),
  requireOwnerForLookup: true,
  storageKey: ({ customerId, visitId }, id, filename) => buildStorageKey(customerId, visitId, id, filename),
  findMany: ({ visitId }, options) => db.customerVisitAttachment.findMany({
    ...options,
    where: { visitId },
    orderBy: { createdAt: 'asc' },
  }),
  count: ({ visitId }) => db.customerVisitAttachment.count({ where: { visitId } }),
  create: ({ visitId }, data) => db.customerVisitAttachment.create({
    data: { ...data, visitId },
    include: attachmentUploaderInclude,
  }),
  find: ({ visitId }, id) => db.customerVisitAttachment.findFirst({ where: { id, visitId } }),
  delete: (id) => db.customerVisitAttachment.delete({ where: { id } }),
  map: ({ customerId, visitId }, row) => mapVisitAttachment(customerId, visitId, row),
  notFoundMessage: 'Adjunto de visita no encontrado',
});

export const customerVisitAttachmentService = {
  async list(customerId: string, visitId: string, params: PaginationParams) {
    return attachments.list({ customerId, visitId }, params);
  },

  async upload(customerId: string, visitId: string, uploadedById: string, file: File, descripcion?: string | null) {
    return attachments.upload({ customerId, visitId }, uploadedById, file, descripcion);
  },

  async resolveDownload(
    customerId: string,
    visitId: string,
    attachmentId: string,
    options?: { inline?: boolean }
  ): Promise<AttachmentDownloadResult> {
    return attachments.resolveDownload({ customerId, visitId }, attachmentId, options);
  },

  async getById(customerId: string, visitId: string, attachmentId: string) {
    return attachments.getById({ customerId, visitId }, attachmentId);
  },

  async delete(customerId: string, visitId: string, attachmentId: string) {
    return attachments.delete({ customerId, visitId }, attachmentId);
  },
};
