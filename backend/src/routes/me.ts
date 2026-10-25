import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { serializeProfileForViewer } from '../store';
import type { MatchPreferences, PrivacySettings, Profile } from '../domain';

export function createMeRouter(store: import('../store').Store): Router {
  const router = createRouter();

  router.get('/me/profile', (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    res.json({ user: serializeProfileForViewer(viewer, viewer.id, true) });
  });

  const EDITABLE_KEYS = new Set([
    'name', 'birthDate', 'gender', 'pronouns', 'professionCategory', 'professionTitle', 'companyOrOrg',
    'service', 'rank', 'dutyStation', 'city', 'state', 'bio', 'photos', 'interests', 'datingGoal'
  ]);

  function isSafeMediaUrl(value: string): boolean {
  const url = value.trim();
  return /^https:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url);
}

function sanitizeProfilePatch(body: Record<string, unknown>): Partial<Profile> {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!EDITABLE_KEYS.has(k)) continue;
      if (k === 'photos' || k === 'interests') {
        if (!Array.isArray(v)) continue;
        const values = v.map(String).map((s) => s.slice(0, 600));
        // Photos end up in <img src>: allow only https, same-origin paths and images.
        patch[k] = k === 'photos' ? values.filter(isSafeMediaUrl).slice(0, 8) : values.slice(0, 8);
        continue;
      }
      if (typeof v === 'string') {
        const limits: Record<string, number> = { name: 60, bio: 1000, service: 80, rank: 80, professionTitle: 80, city: 100, state: 100, dutyStation: 120 };
        const limit = limits[k] ?? 150;
        patch[k] = v.slice(0, limit);
      }
      if (k === 'birthDate' && typeof v === 'string') {
        patch.birthDate = v;
      }
    }
    // Enforce an 18+ gate when a birth date is being set
    if (typeof patch.birthDate === 'string') {
      const bd = new Date(patch.birthDate);
      if (Number.isNaN(bd.getTime())) delete patch.birthDate;
      else {
        const age = (Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age < 18) delete patch.birthDate;
      }
    }
    return patch as Partial<Profile>;
  }

  router.patch('/me/profile', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const patch = sanitizeProfilePatch(req.body || {});
    if (patch.name !== undefined && !patch.name.trim()) { res.status(400).json({ error: 'Name cannot be empty.' }); return; }
    const updated = await store.updateProfile(viewer.id, patch);
    res.json({ success: true, user: updated ? serializeProfileForViewer(updated, viewer.id, true) : null });
  });

  router.patch('/me/privacy', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const body = (req.body || {}) as Partial<PrivacySettings>;
    const current = viewer.privacy;
    const next: PrivacySettings = {
      serviceVisibility: (['public', 'matches', 'private'].includes(String(body.serviceVisibility)) ? body.serviceVisibility : current.serviceVisibility) as PrivacySettings['serviceVisibility'],
      rankVisibility: (['public', 'matches', 'private'].includes(String(body.rankVisibility)) ? body.rankVisibility : current.rankVisibility) as PrivacySettings['rankVisibility'],
      verificationDisplay: (['badge', 'service_badge', 'minimal'].includes(String(body.verificationDisplay)) ? body.verificationDisplay : current.verificationDisplay) as PrivacySettings['verificationDisplay'],
      chatNotifications: typeof body.chatNotifications === 'boolean' ? body.chatNotifications : current.chatNotifications,
      twoFactorAuth: typeof body.twoFactorAuth === 'boolean' ? body.twoFactorAuth : current.twoFactorAuth,
      privateIntroductionOptIn: typeof body.privateIntroductionOptIn === 'boolean' ? body.privateIntroductionOptIn : current.privateIntroductionOptIn
    };
    await store.setPrivacy(viewer.id, next);
    const updated = await store.getProfile(viewer.id);
    res.json({ success: true, privacy: next, user: updated ? serializeProfileForViewer(updated, viewer.id, true) : null });
  });

  router.patch('/me/preferences', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const body = (req.body || {}) as Partial<MatchPreferences>;
    const prefs: MatchPreferences = {
      gender: (['men', 'women', 'everyone'].includes(String(body.gender)) ? body.gender : 'everyone') as MatchPreferences['gender'],
      minAge: Math.min(80, Math.max(18, Number(body.minAge) || 18)),
      maxAge: Math.min(99, Math.max(18, Number(body.maxAge) || 60)),
      maxDistanceKm: body.maxDistanceKm != null ? Math.max(1, Math.min(1000, Number(body.maxDistanceKm))) : undefined
    };
    if (prefs.minAge > prefs.maxAge) { res.status(400).json({ error: 'minAge cannot exceed maxAge.' }); return; }
    await store.setPreferences(viewer.id, prefs);
    res.json({ success: true, preferences: prefs });
  });

  // Soft-delete own account (self-service deletion, data kept for payout
  // reconciliation only, profile hidden immediately)
  router.delete('/me/account', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    await store.softDeleteProfile(viewer.id);
    res.json({ success: true, message: 'Account deleted. Your profile is removed.' });
  });

  return router;
}
