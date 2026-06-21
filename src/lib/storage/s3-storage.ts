import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env.js';
import type { AttachmentStorage, StoredAttachmentObject } from './types.js';
import { buildContentDisposition } from '../attachments/content-disposition.js';

function createS3Client(): S3Client {
  return new S3Client({
    region: env.S3_REGION || 'auto',
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // R2: evita checksums flexibles del SDK v3 que rompen PutObject en algunos buckets
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export function createS3AttachmentStorage(): AttachmentStorage {
  const client = createS3Client();
  const bucket = env.S3_BUCKET;

  return {
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
    },

    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
    },

    async getObject(key): Promise<StoredAttachmentObject | null> {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) return null;
        return {
          body: Buffer.from(bytes),
          contentType: res.ContentType || 'application/octet-stream',
        };
      } catch (err: unknown) {
        const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        const code =
          err && typeof err === 'object' && 'Code' in err ? String((err as { Code?: string }).Code) : '';
        if (name === 'NoSuchKey' || code === 'NoSuchKey') {
          return null;
        }
        throw err;
      }
    },

    async getPresignedDownloadUrl(key, filename, expiresInSeconds = 300, inline = false) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: buildContentDisposition(
          inline ? 'inline' : 'attachment',
          filename
        ),
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
  };
}
