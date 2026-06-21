import { env, isAttachmentsStorageConfigured } from '../env.js';
import { createDevFileAttachmentStorage } from './dev-file-storage.js';
import { createMemoryAttachmentStorage } from './memory-storage.js';
import { createS3AttachmentStorage } from './s3-storage.js';
import type { AttachmentStorage } from './types.js';

let storage: AttachmentStorage | null = null;
let testStorage: AttachmentStorage | null = null;

export function setAttachmentStorageForTests(store: AttachmentStorage | null): void {
  testStorage = store;
}

export function getAttachmentStorage(): AttachmentStorage {
  if (testStorage) {
    return testStorage;
  }
  if (!storage) {
    if (env.ATTACHMENTS_STORAGE === 'memory') {
      storage = createDevFileAttachmentStorage();
    } else {
      if (!isAttachmentsStorageConfigured()) {
        throw new Error('Attachment storage is not configured (S3/R2 env vars missing)');
      }
      storage = createS3AttachmentStorage();
    }
  }
  return storage;
}

export function assertAttachmentStorageConfigured(): void {
  if (testStorage) {
    return;
  }
  if (env.ATTACHMENTS_STORAGE === 'memory') {
    return;
  }
  if (!isAttachmentsStorageConfigured()) {
    throw new Error('ATTACHMENTS_STORAGE_NOT_CONFIGURED');
  }
}

/** Storage real (S3/R2), memory dev, o mock inyectado en tests. */
export function isAttachmentStorageAvailable(): boolean {
  return (
    Boolean(testStorage) ||
    env.ATTACHMENTS_STORAGE === 'memory' ||
    isAttachmentsStorageConfigured()
  );
}

export type { AttachmentStorage } from './types.js';
