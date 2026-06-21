export interface StoredAttachmentObject {
  body: Buffer;
  contentType: string;
}

export interface AttachmentStorage {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getPresignedDownloadUrl(
    key: string,
    filename: string,
    expiresInSeconds?: number,
    inline?: boolean
  ): Promise<string>;
  /** Solo storage local dev; permite servir el archivo sin redirect a R2. */
  getObject?(key: string): Promise<StoredAttachmentObject | null>;
}
