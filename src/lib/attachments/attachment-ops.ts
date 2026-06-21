import { AppError, ErrorCodes } from '../errors.js';
import {
  processAttachmentFile,
  sanitizeFilename,
} from './process-file.js';
import {
  assertAttachmentStorageConfigured,
  getAttachmentStorage,
} from '../storage/index.js';

export function isR2ConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('EPROTO') ||
    msg.includes('handshake failure') ||
    msg.includes('SSL routines') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND')
  );
}

export function mapStorageDownloadError(err: unknown, storageKey: string): AppError {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Object not found') || msg.includes('NoSuchKey')) {
    return new AppError(
      ErrorCodes.RESOURCE_NOT_FOUND,
      'Archivo no encontrado en almacenamiento. Vuelve a subirlo.',
      404
    );
  }
  if (isR2ConnectionError(err)) {
    return new AppError(
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      'No se pudo conectar con Cloudflare R2 (error SSL/TLS). Verifica S3_ENDPOINT: si el bucket es jurisdicción EU usa https://<account_id>.eu.r2.cloudflarestorage.com. En cuentas R2 nuevas el certificado puede tardar unas horas.',
      503
    );
  }
  if (err instanceof AppError) {
    return err;
  }
  return new AppError(
    ErrorCodes.INTERNAL_SERVER_ERROR,
    msg || `Error al acceder al archivo: ${storageKey}`,
    500
  );
}

export function throwIfR2ConnectionError(err: unknown): void {
  if (isR2ConnectionError(err)) {
    throw new AppError(
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      'No se pudo conectar con Cloudflare R2 (error SSL/TLS). Verifica S3_ENDPOINT: si el bucket es jurisdicción EU usa https://<account_id>.eu.r2.cloudflarestorage.com. En cuentas R2 nuevas el certificado puede tardar unas horas.',
      503
    );
  }
}

export interface ProcessedUploadFile {
  originalName: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  buffer: Buffer;
}

export async function processUploadFile(file: File): Promise<ProcessedUploadFile> {
  const arrayBuffer = await file.arrayBuffer();
  const input = Buffer.from(arrayBuffer);
  const originalName = sanitizeFilename(file.name || 'archivo');
  const processed = await processAttachmentFile(input, originalName);
  return {
    originalName,
    mimeType: processed.mimeType,
    originalSizeBytes: processed.originalSizeBytes,
    storedSizeBytes: processed.storedSizeBytes,
    buffer: processed.buffer,
  };
}

export async function putProcessedFile(
  storageKey: string,
  processed: ProcessedUploadFile
): Promise<void> {
  assertAttachmentStorageConfigured();
  const storage = getAttachmentStorage();
  try {
    await storage.putObject(storageKey, processed.buffer, processed.mimeType);
  } catch (err) {
    await storage.deleteObject(storageKey).catch(() => undefined);
    throwIfR2ConnectionError(err);
    throw err;
  }
}

export async function deleteStoredObject(storageKey: string): Promise<void> {
  assertAttachmentStorageConfigured();
  const storage = getAttachmentStorage();
  await storage.deleteObject(storageKey);
}

export type AttachmentDownloadResult =
  | { mode: 'redirect'; url: string }
  | { mode: 'body'; body: Buffer; mimeType: string; filename: string; inline: boolean };

export async function resolveDownloadFromStorage(
  storageKey: string,
  filename: string,
  options?: { inline?: boolean }
): Promise<AttachmentDownloadResult> {
  assertAttachmentStorageConfigured();
  const storage = getAttachmentStorage();
  const inline = options?.inline === true;

  if (storage.getObject) {
    const obj = await storage.getObject(storageKey);
    if (!obj) {
      throw new AppError(
        ErrorCodes.RESOURCE_NOT_FOUND,
        'Archivo no encontrado en almacenamiento. Vuelve a subirlo (registro en base de datos sin binario).',
        404
      );
    }
    return {
      mode: 'body',
      body: obj.body,
      mimeType: obj.contentType,
      filename,
      inline,
    };
  }

  try {
    const url = await storage.getPresignedDownloadUrl(storageKey, filename, undefined, inline);
    return { mode: 'redirect', url };
  } catch (err) {
    throw mapStorageDownloadError(err, storageKey);
  }
}

export function mapUploadedBy(row: { nombre: string; username: string }) {
  return {
    nombre: row.nombre,
    username: row.username,
  };
}
