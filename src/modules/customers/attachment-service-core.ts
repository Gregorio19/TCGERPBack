import { randomUUID } from 'node:crypto';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { buildPaginatedResponse, type PaginationParams } from '../../lib/pagination.js';
import { assertAttachmentStorageConfigured, isAttachmentStorageAvailable } from '../../lib/storage/index.js';
import {
  deleteStoredObject,
  processUploadFile,
  putProcessedFile,
  resolveDownloadFromStorage,
} from '../../lib/attachments/attachment-ops.js';

export const attachmentUploaderInclude = {
  uploadedBy: { select: { nombre: true, username: true } },
} as const;

type DownloadableAttachment = {
  storageKey: string;
  originalName: string;
};

type NewAttachment = DownloadableAttachment & {
  id: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  descripcion: string | null;
  uploadedById: string;
};

type ListOptions = {
  skip: number;
  take: number;
  include: typeof attachmentUploaderInclude;
};

type AttachmentOwner<Owner, Row extends DownloadableAttachment, IncludedRow, Result> = {
  requireOwner(owner: Owner): Promise<unknown>;
  requireOwnerForLookup?: boolean;
  storageKey(owner: Owner, attachmentId: string, filename: string): string;
  findMany(owner: Owner, options: ListOptions): Promise<IncludedRow[]>;
  count(owner: Owner): Promise<number>;
  create(owner: Owner, data: NewAttachment): Promise<IncludedRow>;
  find(owner: Owner, attachmentId: string): Promise<Row | null>;
  delete(attachmentId: string): Promise<unknown>;
  map(owner: Owner, row: IncludedRow): Result;
  notFoundMessage: string;
  handleCreateError?(error: unknown): void;
};

export function createAttachmentService<Owner, Row extends DownloadableAttachment, IncludedRow, Result>(
  adapter: AttachmentOwner<Owner, Row, IncludedRow, Result>
) {
  return {
    async list(owner: Owner, { page, pageSize }: PaginationParams) {
      await adapter.requireOwner(owner);
      const [rows, total] = await Promise.all([
        adapter.findMany(owner, {
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: attachmentUploaderInclude,
        }),
        adapter.count(owner),
      ]);

      return buildPaginatedResponse(rows.map((row) => adapter.map(owner, row)), total, page, pageSize);
    },

    async upload(owner: Owner, uploadedById: string, file: File, descripcion?: string | null) {
      assertAttachmentStorageConfigured();
      await adapter.requireOwner(owner);

      const processed = await processUploadFile(file);
      const id = randomUUID();
      const storageKey = adapter.storageKey(owner, id, processed.originalName);
      await putProcessedFile(storageKey, processed);

      try {
        const row = await adapter.create(owner, {
          id,
          originalName: processed.originalName,
          mimeType: processed.mimeType,
          originalSizeBytes: processed.originalSizeBytes,
          storedSizeBytes: processed.storedSizeBytes,
          storageKey,
          descripcion: descripcion ?? null,
          uploadedById,
        });
        return adapter.map(owner, row);
      } catch (err) {
        await deleteStoredObject(storageKey).catch(() => undefined);
        adapter.handleCreateError?.(err);
        throw err;
      }
    },

    async getById(owner: Owner, attachmentId: string) {
      if (adapter.requireOwnerForLookup) {
        await adapter.requireOwner(owner);
      }
      const row = await adapter.find(owner, attachmentId);
      if (!row) {
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, adapter.notFoundMessage, 404);
      }
      return row;
    },

    async resolveDownload(owner: Owner, attachmentId: string, options?: { inline?: boolean }) {
      const row = await this.getById(owner, attachmentId);
      return resolveDownloadFromStorage(row.storageKey, row.originalName, options);
    },

    async delete(owner: Owner, attachmentId: string) {
      assertAttachmentStorageConfigured();
      const row = await this.getById(owner, attachmentId);
      await deleteStoredObject(row.storageKey);
      await adapter.delete(attachmentId);
    },
  };
}

export function parseAttachmentForm(form: FormData) {
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
  return { file, descripcion };
}

export function requireAttachmentStorage() {
  if (!isAttachmentStorageAvailable()) {
    throw new AppError(
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      'Almacenamiento de adjuntos no configurado (variables S3/R2)',
      503
    );
  }
}
