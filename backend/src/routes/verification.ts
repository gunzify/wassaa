import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { rateLimit } from '../lib/rate-limit';
import { serializeProfileForViewer } from '../store';
import { isStorageKey, storageEnabled } from '../lib/storage';
import type { Profile } from '../domain';

const MAX_DATA_URL_CHARS = 8 * 1024 * 1024; // 6 MB image -> ~8 MB as base64
const DOCUMENT_TYPES = ['NIN', 'Passport', 'DriversLicense', 'ServiceID'];

/** Media can arrive two ways:
 *   - R2 key the user just uploaded (preferred; object never touches the API)
 *   - a data-URL (development fallback when storage is not configured)
 *  Keys are namespaced per user, so ownership is checked rather than trusted. */
function acceptMedia(value: unknown, userId: string): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (value.startsWith('data:image')) {
    return value.length <= MAX_DATA_URL_CHARS ? value : undefined;
  }
  if (!isStorageKey(value) || !storageEnabled()) return undefined;
  // verification/<userId>/<file> — reject anything else, including other users' keys.
  return value.startsWith(`verification/${userId}/`) ? value : undefined;
}

function normalizeDocumentNumber(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (digits.length < 4 || digits.length > 32) return null;
  return digits;
}

/** Identity review submission. This does not establish military or other
 *  uniformed-service employment. */
export function createVerificationRouter(store: import('../store').Store): Router {
  const router = createRouter();

  router.post(
    '/verification/submit',
    rateLimit({
      name: 'verification',
      max: 5,
      windowMs: 24 * 60 * 60 * 1000,
      by: (req) => req.wassaa?.viewer.id || 'anon',
      message: 'Verification submission limit reached. Contact support if your documents keep being rejected.'
    }),
    async (req: Request, res: Response) => {
      const viewer = req.wassaa?.viewer as Profile;
      const body = req.body || {};

      const documentType = DOCUMENT_TYPES.includes(String(body.documentType)) ? String(body.documentType) : null;
      if (!documentType) { res.status(400).json({ error: 'documentType must be NIN, Passport, DriversLicense or ServiceID.' }); return; }

      const documentNumber = normalizeDocumentNumber(body.documentNumber);
      if (!documentNumber) { res.status(400).json({ error: 'Enter the document number printed on the ID (4–32 characters).' }); return; }

      // Prefer uploaded keys; fall back to legacy data-URL fields.
      const idDoc = acceptMedia(body.idDocKey, viewer.id) || acceptMedia(body.idDocDataUrl, viewer.id);
      const selfie = acceptMedia(body.selfieKey, viewer.id) || acceptMedia(body.selfieDataUrl, viewer.id);
      if (!idDoc || !selfie) {
        res.status(400).json({ error: 'A clear photo of the ID and a live selfie are required.' });
        return;
      }

      const pending = (await store.listPendingVerifications()).find((p) => p.userId === viewer.id);
      if (pending) {
        res.status(409).json({ error: 'You already have a verification under review.', submissionId: pending.id });
        return;
      }
      if (viewer.verificationStatus === 'verified') {
        res.status(409).json({ error: 'This account is already verified.' });
        return;
      }

      // Keep only the last three characters visible to the review panel.
      const masked = documentNumber.replace(/.(?=.{3})/g, '*');

      const submission = await store.createVerificationSubmission({
        userId: viewer.id,
        documentType,
        documentNumberMasked: masked,
        idDocUrl: idDoc,
        selfieUrl: selfie,
        status: 'pending'
      });

      // The badge stays off until a human decides; the profile shows "in review".
      await store.setVerificationStatus(viewer.id, 'pending', null);
      await store.updateProfile(viewer.id, { documentType });
      const updated = await store.getProfile(viewer.id);

      res.json({
        success: true,
        status: 'pending',
        submissionId: submission.id,
        message: 'Submitted for review. Manual adjudication usually completes within 24 hours. Documents are purged immediately after a decision.',
        user: updated ? serializeProfileForViewer(updated, viewer.id, true) : null
      });
    }
  );

  router.get('/verification/status', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const pending = (await store.listPendingVerifications()).find((p) => p.userId === viewer.id);
    res.json({
      status: viewer.verificationStatus,
      verifiedAt: viewer.verifiedAt,
      documentType: viewer.documentType,
      pendingSubmissionId: pending?.id
    });
  });

  return router;
}
