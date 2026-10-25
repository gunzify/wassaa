import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { isAllowedImageType, newObjectKey, presignUpload, publicUrl, storageEnabled } from '../lib/storage';
import { config, r2PublicConfigured } from '../config';
import { limitForUser } from '../lib/rate-limit';
import type { Profile } from '../domain';

type Kind = 'photo' | 'id_doc' | 'selfie' | 'chat_photo';

/** The client asks for a one-shot upload URL, PUTs straight to R2, then keeps the key.
 *  Media never flows through the API, so large uploads cannot exhaust memory or the pool. */
export function createUploadsRouter(): Router {
  const router = createRouter();

  router.post('/uploads/presign', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const kind = String(req.body?.kind || '') as Kind;
    const contentType = String(req.body?.contentType || 'image/jpeg').toLowerCase();

    if (!['photo', 'id_doc', 'selfie', 'chat_photo'].includes(kind)) {
      res.status(400).json({ error: 'kind must be photo, id_doc, selfie or chat_photo.' });
      return;
    }
    if (!isAllowedImageType(contentType)) {
      res.status(415).json({ error: 'Only JPEG, PNG or WebP images are accepted.' });
      return;
    }
    if (!storageEnabled()) {
      res.status(503).json({ error: 'Object storage is not configured on this server.', storage: false });
      return;
    }
    if (kind === 'photo' && !r2PublicConfigured()) {
      res.status(503).json({ error: 'Public profile photo storage is not configured separately from private verification storage.', storage: false });
      return;
    }

    // Photos are cheap to re-take; ID documents are scarce and sensitive.
    const limit = kind === 'photo'
      ? limitForUser('upload:photo', viewer.id, 40, 60 * 60 * 1000)
      : kind === 'chat_photo'
        ? limitForUser('upload:chat-photo', viewer.id, 30, 60 * 60 * 1000)
        : limitForUser('upload:document', viewer.id, 6, 24 * 60 * 60 * 1000);
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      res.status(429).json({ error: 'Upload limit reached. Try again later.', retryAfterSeconds: limit.retryAfterSeconds });
      return;
    }

    const key = newObjectKey(kind, viewer.id, contentType);
    const uploadUrl = await presignUpload(key, contentType, 300, kind === 'photo' ? config.r2PublicBucket : config.r2Bucket);
    res.json({
      uploadUrl,
      key,
      expiresIn: 300,
      // Public URL is only ever handed out for profile/chat photos.
      publicUrl: kind === 'photo' ? publicUrl(key) : null,
      storage: true
    });
  });

  return router;
}
