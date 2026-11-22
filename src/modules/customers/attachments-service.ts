import { db } from '../../lib/db.js';
import { assertAttachmentStorageConfigured, getAttachmentStorage } from '../../lib/storage/index.js';
import {
  mapStorageDownloadError,
  mapUploadedBy,
  throwIfR2ConnectionError,
} from '../../lib/attachments/attachment-ops.js';
import { attachmentUploaderInclude, createAttachmentService } from './attachment-service-core.js';
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

const attachments = createAttachmentService({
  requireOwner: (customerId: string) => customerService.getById(customerId),
  storageKey: buildStorageKey,
  findMany: (customerId, options) => db.customerAttachment.findMany({
    ...options,
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  }),
  count: (customerId) => db.customerAttachment.count({ where: { customerId } }),
  create: (customerId, data) => db.customerAttachment.create({
    data: { ...data, customerId },
    include: attachmentUploaderInclude,
  }),
  find: (customerId, id) => db.customerAttachment.findFirst({ where: { id, customerId } }),
  delete: (id) => db.customerAttachment.delete({ where: { id } }),
  map: (_customerId, row) => mapAttachment(row),
  notFoundMessage: 'Adjunto no encontrado',
  handleCreateError: throwIfR2ConnectionError,
});

export const customerAttachmentService = {
  ...attachments,

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
};
