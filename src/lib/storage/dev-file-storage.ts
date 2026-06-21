import fs from 'node:fs/promises';
import path from 'node:path';
import type { AttachmentStorage, StoredAttachmentObject } from './types.js';

const BASE_DIR = path.join(process.cwd(), '.attachments-dev');

function resolvePaths(key: string): { dataPath: string; metaPath: string } {
  const dataPath = path.join(BASE_DIR, key);
  return { dataPath, metaPath: `${dataPath}.meta.json` };
}

/** Persistencia en disco para dev local (ATTACHMENTS_STORAGE=memory). */
export function createDevFileAttachmentStorage(): AttachmentStorage {
  return {
    async putObject(key, body, contentType) {
      const { dataPath, metaPath } = resolvePaths(key);
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      await fs.writeFile(dataPath, body);
      await fs.writeFile(metaPath, JSON.stringify({ contentType }));
    },

    async deleteObject(key) {
      const { dataPath, metaPath } = resolvePaths(key);
      await fs.rm(dataPath, { force: true });
      await fs.rm(metaPath, { force: true });
    },

    async getObject(key): Promise<StoredAttachmentObject | null> {
      const { dataPath, metaPath } = resolvePaths(key);
      try {
        const [body, metaRaw] = await Promise.all([
          fs.readFile(dataPath),
          fs.readFile(metaPath, 'utf8'),
        ]);
        const meta = JSON.parse(metaRaw) as { contentType?: string };
        return {
          body,
          contentType: meta.contentType || 'application/octet-stream',
        };
      } catch {
        return null;
      }
    },

    async getPresignedDownloadUrl(key, filename, _expiresInSeconds, inline = false) {
      const obj = await this.getObject!(key);
      if (!obj) {
        throw new Error(`Object not found: ${key}`);
      }
      const disposition = inline ? 'inline' : 'attachment';
      return `dev-file://${encodeURIComponent(key)}?disposition=${disposition}&name=${encodeURIComponent(filename)}`;
    },
  };
}
