import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { env } from '../env.js';
import { AppError, ErrorCodes } from '../errors.js';

export const ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface ProcessedAttachmentFile {
  buffer: Buffer;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\.\./g, '_').trim() || 'archivo';
  return base.slice(0, 200);
}

export async function processAttachmentFile(
  input: Buffer,
  declaredName: string
): Promise<ProcessedAttachmentFile> {
  const originalSizeBytes = input.length;

  if (originalSizeBytes === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'El archivo está vacío', 422, [
      { field: 'file', message: 'Archivo vacío' },
    ]);
  }

  if (originalSizeBytes > env.ATTACHMENTS_MAX_BYTES) {
    throw new AppError(
      ErrorCodes.INVALID_RANGE,
      `El archivo supera el límite de ${env.ATTACHMENTS_MAX_BYTES} bytes`,
      422,
      [{ field: 'file', message: 'Tamaño máximo 10 MB' }]
    );
  }

  const detected = await fileTypeFromBuffer(input);
  const mimeType = detected?.mime;

  if (!mimeType || !ALLOWED_ATTACHMENT_MIMES.has(mimeType)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      'Tipo de archivo no permitido. Use imagen, PDF, Word o Excel.',
      422,
      [{ field: 'file', message: 'UNSUPPORTED_FILE_TYPE' }]
    );
  }

  if (IMAGE_MIMES.has(mimeType)) {
    const image = sharp(input, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    const maxSide = 2048;
    let pipeline = image;
    if (meta.width && meta.height && (meta.width > maxSide || meta.height > maxSide)) {
      pipeline = pipeline.resize({
        width: maxSide,
        height: maxSide,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let output: Buffer;
    let outMime: string;
    if (mimeType === 'image/png' || mimeType === 'image/gif') {
      output = await pipeline.webp({ quality: 80 }).toBuffer();
      outMime = 'image/webp';
    } else {
      output = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      outMime = 'image/jpeg';
    }

    if (output.length > env.ATTACHMENTS_MAX_BYTES) {
      throw new AppError(
        ErrorCodes.INVALID_RANGE,
        'La imagen comprimida aún supera 10 MB',
        422,
        [{ field: 'file', message: 'Tamaño máximo 10 MB' }]
      );
    }

    return {
      buffer: output,
      mimeType: outMime,
      originalSizeBytes,
      storedSizeBytes: output.length,
    };
  }

  return {
    buffer: input,
    mimeType,
    originalSizeBytes,
    storedSizeBytes: originalSizeBytes,
  };
}
