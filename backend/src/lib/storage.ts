// Cloudflare R2 (S3-compatible) helpers.
//
// Two classes of object live here and they must never mix:
//   photos/<userId>/…      profile & chat images — public, served by R2_PUBLIC_BASE_URL
//   verification/<userId>/… ID scans and selfies — PRIVATE, short-lived presigned GETs only
//
// When R2 is not configured the API keeps working: verification media falls back
// to data-URLs in the database (dev only) and photo uploads are rejected with a
// clear message instead of silently losing the image.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { config, r2Configured, r2PublicConfigured } from '../config';

const PUBLIC_PREFIX = 'photos/';
const PRIVATE_PREFIX = 'verification/';
const CHAT_PREFIX = 'chat/';

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    if (!r2Configured()) throw new Error('Object storage is not configured.');
    client = new S3Client({
      region: 'auto',
      endpoint: config.r2Endpoint || `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey
      },
      // R2 does not support the SDK's default flexible checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    });
  }
  return client;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export function isAllowedImageType(contentType: string): boolean {
  return contentType in EXT_BY_TYPE;
}

export function newObjectKey(kind: 'photo' | 'id_doc' | 'selfie' | 'chat_photo', userId: string, contentType: string): string {
  const ext = EXT_BY_TYPE[contentType] || 'jpg';
  const prefix = kind === 'photo' ? PUBLIC_PREFIX : kind === 'chat_photo' ? CHAT_PREFIX : PRIVATE_PREFIX;
  return `${prefix}${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/** Presigned PUT so the browser uploads straight to R2 (never through us). */
export async function presignUpload(key: string, contentType: string, expiresIn = 300, bucket = config.r2Bucket): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

/** Short-lived presigned GET for private media (admin review only). */
export async function presignDownload(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: config.r2Bucket, Key: key }), { expiresIn });
}

/** Public URL for profile media, or null when no public base is set. */
export function publicUrl(key: string): string | null {
  return key.startsWith(PUBLIC_PREFIX) && r2PublicConfigured() ? `${config.r2PublicBaseUrl}/${key}` : null;
}

export async function deleteObject(key: string): Promise<void> {
  if (!r2Configured()) return;
  try {
    const bucket = key.startsWith(PUBLIC_PREFIX) ? config.r2PublicBucket : config.r2Bucket;
    await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    // Never fail a decision because cleanup failed; log for the ops sweep.
    console.error('[storage] delete failed', key, err instanceof Error ? err.message : err);
  }
}

export function isStorageKey(value: string | undefined): value is string {
  return Boolean(value && !value.startsWith('data:') && !/^https?:\/\//i.test(value));
}

export function storageEnabled(): boolean {
  return r2Configured();
}

/** Delete every stored object referenced by a submission (zero-retention). */
export async function purgeSubmissionMedia(values: (string | undefined)[]): Promise<void> {
  for (const value of values) {
    if (isStorageKey(value)) await deleteObject(value);
  }
}
