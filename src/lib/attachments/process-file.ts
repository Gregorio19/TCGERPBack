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

export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

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
  _declaredName: string,
  options?: { productImage: true }
): Promise<ProcessedAttachmentFile> {
  const maxBytes = options?.productImage ? PRODUCT_IMAGE_MAX_BYTES : env.ATTACHMENTS_MAX_BYTES;
  const originalSizeBytes = input.length;

  if (originalSizeBytes === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'El archivo está vacío', 422, [
      { field: 'file', message: 'Archivo vacío' },
    ]);
  }

  if (originalSizeBytes > maxBytes) {
    throw new AppError(
      ErrorCodes.INVALID_RANGE,
      `El archivo supera el límite de ${maxBytes} bytes`,
      422,
      [{ field: 'file', message: 'Tamaño máximo 10 MB' }]
    );
  }

  const detected = await fileTypeFromBuffer(input).catch(() => undefined);
  const mimeType = detected?.mime;

  if (!mimeType || !(options?.productImage ? IMAGE_MIMES : ALLOWED_ATTACHMENT_MIMES).has(mimeType)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      options?.productImage ? 'Tipo de archivo no permitido. Use una imagen.'
        : 'Tipo de archivo no permitido. Use imagen, PDF, Word o Excel.',
      422,
      [{ field: 'file', message: 'UNSUPPORTED_FILE_TYPE' }]
    );
  }

  if (options?.productImage) {
    const buffer = await sharp(input, { limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer().catch(() => {
        throw new AppError(ErrorCodes.INVALID_FORMAT, 'Imagen inválida', 422);
      });
    return { buffer, mimeType: 'image/webp', originalSizeBytes, storedSizeBytes: buffer.length };
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
