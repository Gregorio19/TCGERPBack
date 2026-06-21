import { randomUUID } from 'node:crypto';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import {
  assertAttachmentStorageConfigured,
} from '../../lib/storage/index.js';
import {
  deleteStoredObject,
  mapUploadedBy,
  processUploadFile,
  putProcessedFile,
  resolveDownloadFromStorage,
  type AttachmentDownloadResult,
} from '../../lib/attachments/attachment-ops.js';
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

export const customerVisitAttachmentService = {
  async list(customerId: string, visitId: string, params: PaginationParams) {
    await getVisitForCustomer(customerId, visitId);
    const { page, pageSize } = params;
    const where = { visitId };

    const [rows, total] = await Promise.all([
      db.customerVisitAttachment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          uploadedBy: { select: { nombre: true, username: true } },
        },
      }),
      db.customerVisitAttachment.count({ where }),
    ]);

    const data = rows.map((row) => mapVisitAttachment(customerId, visitId, row));
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async upload(
    customerId: string,
    visitId: string,
    uploadedById: string,
    file: File,
    descripcion?: string | null
  ) {
    assertAttachmentStorageConfigured();
    await getVisitForCustomer(customerId, visitId);

    const processed = await processUploadFile(file);
    const attachmentId = randomUUID();
    const storageKey = buildStorageKey(
      customerId,
      visitId,
      attachmentId,
      processed.originalName
    );

    await putProcessedFile(storageKey, processed);

    try {
      const row = await db.customerVisitAttachment.create({
        data: {
          id: attachmentId,
          visitId,
          originalName: processed.originalName,
          mimeType: processed.mimeType,
          originalSizeBytes: processed.originalSizeBytes,
          storedSizeBytes: processed.storedSizeBytes,
          storageKey,
          descripcion: descripcion ?? null,
          uploadedById,
        },
        include: {
          uploadedBy: { select: { nombre: true, username: true } },
        },
      });
      return mapVisitAttachment(customerId, visitId, row);
    } catch (err) {
      await deleteStoredObject(storageKey).catch(() => undefined);
      throw err;
    }
  },

  async resolveDownload(
    customerId: string,
    visitId: string,
    attachmentId: string,
    options?: { inline?: boolean }
  ): Promise<AttachmentDownloadResult> {
    const row = await this.getById(customerId, visitId, attachmentId);
    return resolveDownloadFromStorage(row.storageKey, row.originalName, options);
  },

  async getById(customerId: string, visitId: string, attachmentId: string) {
    await getVisitForCustomer(customerId, visitId);
    const row = await db.customerVisitAttachment.findFirst({
      where: { id: attachmentId, visitId },
    });
    if (!row) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Adjunto de visita no encontrado', 404);
    }
    return row;
  },

  async delete(customerId: string, visitId: string, attachmentId: string) {
    assertAttachmentStorageConfigured();
    const row = await this.getById(customerId, visitId, attachmentId);
    await deleteStoredObject(row.storageKey);
    await db.customerVisitAttachment.delete({ where: { id: attachmentId } });
  },
};
