import type { AttachmentStorage } from './types.js';

/** Almacenamiento en memoria para tests de integración. */
export function createMemoryAttachmentStorage(): AttachmentStorage & {
  objects: Map<string, { body: Buffer; contentType: string }>;
} {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  return {
    objects,
    async putObject(key, body, contentType) {
      objects.set(key, { body: Buffer.from(body), contentType });
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    async getPresignedDownloadUrl(key, filename) {
      if (!objects.has(key)) {
        throw new Error(`Object not found: ${key}`);
      }
      return `https://memory.test/${encodeURIComponent(key)}?name=${encodeURIComponent(filename)}`;
    },
  };
}
