import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { requireAdmin } from './context';
import { isStorageKey, presignDownload, purgeSubmissionMedia, storageEnabled } from '../lib/storage';
import type { SafetyReport } from '../domain';

const REPORT_STATUSES: SafetyReport['status'][] = ['pending_review', 'investigating', 'resolved', 'dismissed'];

/** Admin endpoints for the Safety Integrity Team, consumed by /admin.
 *  Every route is behind `x-admin-key`; every decision is written to admin_audit. */
export function createAdminRouter(store: import('../store').Store): Router {
  const router = createRouter();
  router.use('/admin', requireAdmin);

  /** Turns a stored value into something the panel can render:
   *  private R2 keys get a short-lived presigned GET, legacy data-URLs pass through. */
  async function mediaUrl(value?: string): Promise<string | null> {
    if (!value) return null;
    if (!isStorageKey(value)) return value;
    if (!storageEnabled()) return null;
    try {
      return await presignDownload(value, 300);
    } catch {
      return null;
    }
  }

  function adminId(req: Request): string {
    const raw = req.headers['x-admin-id'] || req.body?.adminId;
    return String(raw || 'integrity-team').replace(/[^\w@.\- ]/g, '').slice(0, 60) || 'integrity-team';
  }

  // Session probe for the panel: confirms the key before it renders the queue.
  router.get('/admin/session', (_req: Request, res: Response) => {
    res.json({ ok: true, storage: storageEnabled() });
  });

  // ---------- Verification queue ----------
  router.get('/admin/verifications', async (_req: Request, res: Response) => {
    const pending = await store.listPendingVerifications();
    const queue = [];
    for (const sub of pending) {
      const profile = await store.getProfile(sub.userId);
      queue.push({
        id: sub.id,
        submittedAt: sub.submittedAt,
        documentType: sub.documentType,
        documentNumberMasked: sub.documentNumberMasked,
        idDocUrl: await mediaUrl(sub.idDocUrl),
        selfieUrl: await mediaUrl(sub.selfieUrl),
        profile: profile
          ? {
              id: profile.id,
              name: profile.name,
              birthDate: profile.birthDate,
              age: profileAge(profile.birthDate),
              gender: profile.gender,
              phone: profile.phone,
              city: profile.city,
              state: profile.state,
              professionTitle: profile.professionTitle,
              professionCategory: profile.professionCategory,
              verificationStatus: profile.verificationStatus,
              photos: profile.photos
            }
          : null
      });
    }
    res.json({ queue, storage: storageEnabled() });
  });

  router.post('/admin/verifications/:id/review', async (req: Request, res: Response) => {
    const approve = !!req.body?.approve;
    const note = req.body?.note ? String(req.body.note).slice(0, 500) : undefined;
    const who = adminId(req);

    const existing = await store.getVerificationSubmission(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Submission not found.' }); return; }

    const resolved = await store.resolveVerificationSubmission(req.params.id, approve, who, note);
    if (!resolved) { res.status(409).json({ error: 'This submission has already been reviewed.' }); return; }

    // Zero retention: remove the objects themselves, not just the references.
    await purgeSubmissionMedia([existing.idDocUrl, existing.selfieUrl]);
    await store.recordAdminAction(approve ? 'verification.approved' : 'verification.rejected', who, resolved.id, {
      userId: resolved.userId,
      note: note || null
    });

    const profile = await store.getProfile(resolved.userId);
    res.json({
      success: true,
      submission: { id: resolved.id, status: resolved.status, reviewedAt: resolved.reviewedAt },
      user: profile ? { id: profile.id, name: profile.name, verificationStatus: profile.verificationStatus } : null
    });
  });

  // ---------- Safety reports ----------
  router.get('/admin/reports', async (req: Request, res: Response) => {
    const raw = String(req.query.status || 'all');
    const status = REPORT_STATUSES.includes(raw as SafetyReport['status']) ? (raw as SafetyReport['status']) : undefined;
    const reports = await store.listReports(status);
    const rows = [];
    for (const report of reports) {
      const [reporter, reported] = await Promise.all([
        store.getProfile(report.reporterId),
        store.getProfile(report.reportedUserId)
      ]);
      rows.push({
        ...report,
        reporter: reporter ? { id: reporter.id, name: reporter.name } : null,
        reported: reported
          ? { id: reported.id, name: reported.name, blocked: reported.blockedUs, verificationStatus: reported.verificationStatus }
          : null
      });
    }
    res.json({ reports: rows });
  });

  router.post('/admin/reports/:id/status', async (req: Request, res: Response) => {
    const status = String(req.body?.status || '') as SafetyReport['status'];
    if (!REPORT_STATUSES.includes(status)) { res.status(400).json({ error: 'Invalid report status.' }); return; }
    const updated = await store.updateReportStatus(req.params.id, status);
    if (!updated) { res.status(404).json({ error: 'Report not found.' }); return; }
    const who = adminId(req);
    await store.recordAdminAction('report.status', who, updated.id, { status });
    res.json({ success: true, report: updated });
  });

  // ---------- Account action ----------
  router.post('/admin/users/:id/block', async (req: Request, res: Response) => {
    const blocked = req.body?.blocked !== false; // default: block
    const profile = await store.getProfile(req.params.id);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    await store.setUserBlocked(profile.id, blocked);
    const who = adminId(req);
    await store.recordAdminAction(blocked ? 'user.blocked' : 'user.unblocked', who, profile.id, {
      reason: req.body?.reason ? String(req.body.reason).slice(0, 200) : null
    });
    res.json({ success: true, user: { id: profile.id, name: profile.name, blocked } });
  });

  // ---------- Audit trail ----------
  router.get('/admin/audit', async (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ actions: await store.listAdminActions(limit) });
  });

  return router;
}

function profileAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const born = new Date(birthDate).getTime();
  if (Number.isNaN(born)) return undefined;
  return Math.max(18, Math.floor((Date.now() - born) / (365.25 * 24 * 3600 * 1000)));
}
