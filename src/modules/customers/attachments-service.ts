import { randomUUID } from 'node:crypto';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import {
  assertAttachmentStorageConfigured,
  getAttachmentStorage,
} from '../../lib/storage/index.js';
import {
  deleteStoredObject,
  mapStorageDownloadError,
  mapUploadedBy,
  processUploadFile,
  putProcessedFile,
  resolveDownloadFromStorage,
  throwIfR2ConnectionError,
} from '../../lib/attachments/attachment-ops.js';
import { customerService } from './service.js';

function buildStorageKey(customerId: string, attachmentId: string, filename: string): string {
  return `customers/${customerId}/${attachmentId}/${filename}`;
}

function mapAttachment(row: {
  id: string;
  customerId: string;
  originalName: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  descripcion: string | null;
  createdAt: Date;
  uploadedBy: { nombre: string; username: string };
}) {
  return {
    id: row.id,
    customerId: row.customerId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    originalSizeBytes: row.originalSizeBytes,
    storedSizeBytes: row.storedSizeBytes,
    descripcion: row.descripcion,
    createdAt: row.createdAt,
    uploadedBy: mapUploadedBy(row.uploadedBy),
    downloadPath: `/api/customers/${row.customerId}/attachments/${row.id}/download`,
  };
}

export const customerAttachmentService = {
  async list(customerId: string, params: PaginationParams) {
    await customerService.getById(customerId);
    const { page, pageSize } = params;
    const where = { customerId };

    const [rows, total] = await Promise.all([
      db.customerAttachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          uploadedBy: { select: { nombre: true, username: true } },
        },
      }),
      db.customerAttachment.count({ where }),
    ]);

    const data = rows.map(mapAttachment);
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async upload(
    customerId: string,
    uploadedById: string,
    file: File,
    descripcion?: string | null
  ) {
    assertAttachmentStorageConfigured();
    await customerService.getById(customerId);

    const processed = await processUploadFile(file);
    const attachmentId = randomUUID();
    const storageKey = buildStorageKey(customerId, attachmentId, processed.originalName);

    await putProcessedFile(storageKey, processed);

    try {
      const row = await db.customerAttachment.create({
        data: {
          id: attachmentId,
          customerId,
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
      return mapAttachment(row);
    } catch (err) {
      await deleteStoredObject(storageKey).catch(() => undefined);
      throwIfR2ConnectionError(err);
      throw err;
    }
  },

  async getDownloadUrl(
    customerId: string,
    attachmentId: string,
    options?: { inline?: boolean }
  ): Promise<string> {
    assertAttachmentStorageConfigured();
    const row = await this.getById(customerId, attachmentId);
    const storage = getAttachmentStorage();
    try {
      return await storage.getPresignedDownloadUrl(
        row.storageKey,
        row.originalName,
        undefined,
        options?.inline === true
      );
    } catch (err) {
      throw mapStorageDownloadError(err, row.storageKey);
    }
  },

  async resolveDownload(
    customerId: string,
    attachmentId: string,
    options?: { inline?: boolean }
  ) {
    const row = await this.getById(customerId, attachmentId);
    return resolveDownloadFromStorage(row.storageKey, row.originalName, options);
  },

  async getById(customerId: string, attachmentId: string) {
    const row = await db.customerAttachment.findFirst({
      where: { id: attachmentId, customerId },
    });
    if (!row) {
      throw new AppError(
        ErrorCodes.RESOURCE_NOT_FOUND,
        'Adjunto no encontrado',
        404
      );
    }
    return row;
  },

  async delete(customerId: string, attachmentId: string) {
    assertAttachmentStorageConfigured();
    const row = await this.getById(customerId, attachmentId);
    await deleteStoredObject(row.storageKey);
    await db.customerAttachment.delete({ where: { id: attachmentId } });
  },
};
