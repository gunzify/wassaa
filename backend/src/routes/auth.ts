import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { consume, rateLimit } from '../lib/rate-limit';
import { generateOtp, sendOtpSms } from '../lib/sms';
import { signGoogleLinkToken, signSession, verifyGoogleLinkToken } from '../lib/jwt';
import { GoogleKeyServiceError, verifyGoogleIdToken } from '../lib/google-id-token';
import { config } from '../config';
import { serializeProfileForViewer } from '../store';
import type { Profile } from '../domain';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_ATTEMPTS = 5;

function normalizePhone(input: string): string | null {
  // Accept 080... 23480... +23480... -> +234 E.164
  let p = input.replace(/[\s()-]/g, '');
  if (p.startsWith('0')) p = `+234${p.slice(1)}`;
  else if (p.startsWith('234')) p = `+${p}`;
  if (/^\+234[789]\d{9}$/.test(p)) return p;
  return null;
}

export function createAuthRouter(store: import('../store').Store): Router {
  const router = createRouter();

  // Google proves control of a Google account. Phone OTP is still required
  // before a new identity can be linked to a WASSAA profile.
  router.post('/auth/google', rateLimit({ name: 'auth:google', max: 15, windowMs: 10 * 60 * 1000 }), async (req: Request, res: Response) => {
    if (!config.googleClientId) { res.status(503).json({ error: 'Google sign-in is not configured.' }); return; }
    const credential = req.body?.credential;
    if (typeof credential !== 'string' || credential.length > 12_000) {
      res.status(400).json({ error: 'A valid Google credential is required.' });
      return;
    }

    let identity;
    try {
      identity = await verifyGoogleIdToken(credential, config.googleClientId);
    } catch (error) {
      if (error instanceof GoogleKeyServiceError) {
        res.status(503).json({ error: 'Google sign-in is temporarily unavailable. Try again shortly.' });
        return;
      }
      throw error;
    }
    if (!identity) { res.status(401).json({ error: 'Google could not verify this sign-in. Try again.' }); return; }

    const profile = await store.findProfileByGoogleSub(identity.sub);
    if (profile?.blockedUs) { res.status(403).json({ error: 'This account has been suspended. Contact support.' }); return; }
    if (profile) {
      const token = signSession(profile.id, profile.tier);
      res.json({
        success: true,
        needsPhone: false,
        isNew: profile.professionCategory === 'Others' && !profile.photos.length,
        sessionToken: token,
        user: serializeProfileForViewer(profile, profile.id, true)
      });
      return;
    }

    const googleLinkToken = signGoogleLinkToken({ googleSub: identity.sub, email: identity.email, name: identity.name });
    res.json({ success: true, needsPhone: true, googleLinkToken });
  });

  // --- OTP: request ---
  // Per-IP throttle first (cheap), then a per-phone throttle so one number cannot
  // be used to burn SMS credit, and a global ceiling for the endpoint.
  router.post('/auth/otp/request', rateLimit({ name: 'otp:ip', max: 10, windowMs: 10 * 60 * 1000 }), async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.body?.phone || ''));
    if (!phone) { res.status(400).json({ error: 'Provide a valid Nigerian phone number (+234…).' }); return; }

    const phoneLimit = consume(`otp:phone:${phone}`, 3, 10 * 60 * 1000);
    if (!phoneLimit.ok) {
      res.setHeader('Retry-After', String(phoneLimit.retryAfterSeconds));
      res.status(429).json({ error: 'Too many codes requested for this number. Try again later.', retryAfterSeconds: phoneLimit.retryAfterSeconds });
      return;
    }

    const existing = await store.getOtpSession(phone);
    const now = Date.now();
    if (existing && now - existing.lastRequestId < OTP_RESEND_COOLDOWN_MS) {
      res.status(429).json({ error: `Please wait ${Math.ceil((existing.lastRequestId + OTP_RESEND_COOLDOWN_MS - now) / 1000)}s before requesting another code.` });
      return;
    }

    const code = generateOtp();
    await store.createOtpSession(phone, code, OTP_TTL_MS, now);
    const delivery = await sendOtpSms(phone, code);

    res.json({
      success: true,
      phone,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      delivered: delivery.delivered,
      // devCode is only ever populated outside production
      ...(delivery.devCode ? { devCode: delivery.devCode } : {})
    });
  });

  // --- OTP: verify (creates the account on first sign-in) ---
  router.post('/auth/otp/verify', rateLimit({ name: 'otp:verify', max: 20, windowMs: 10 * 60 * 1000 }), async (req: Request, res: Response) => {
    const phone = normalizePhone(String(req.body?.phone || ''));
    const code = String(req.body?.code || '').trim();
    if (!phone || !/^\d{6}$/.test(code)) { res.status(400).json({ error: 'Valid phone and 6-digit code required.' }); return; }

    const rawGoogleLinkToken = req.body?.googleLinkToken;
    if (rawGoogleLinkToken !== undefined && (typeof rawGoogleLinkToken !== 'string' || rawGoogleLinkToken.length > 4096)) {
      res.status(400).json({ error: 'Invalid Google sign-in state. Start Google sign-in again.' });
      return;
    }
    const googleIdentity = typeof rawGoogleLinkToken === 'string' ? verifyGoogleLinkToken(rawGoogleLinkToken) : null;
    if (rawGoogleLinkToken && !googleIdentity) {
      res.status(401).json({ error: 'Google sign-in expired. Start Google sign-in again.' });
      return;
    }

    const session = await store.getOtpSession(phone);
    const now = Date.now();
    if (!session) { res.status(400).json({ error: 'No verification in progress. Request a new code.' }); return; }
    if (now > session.expiresAt) {
      await store.deleteOtpSession(phone);
      res.status(400).json({ error: 'This code has expired. Request a new one.' });
      return;
    }
    if (session.attempts >= MAX_ATTEMPTS) {
      await store.deleteOtpSession(phone);
      res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
      return;
    }

    if (session.code !== code) {
      await store.updateOtpSession(phone, { attempts: session.attempts + 1 });
      res.status(400).json({ error: 'Incorrect code. Try again.' });
      return;
    }

    await store.deleteOtpSession(phone);
    let profile = await store.findProfileByPhone(phone);
    if (!profile) profile = await store.createProfile(phone, googleIdentity?.name || undefined);
    if (profile.blockedUs) { res.status(403).json({ error: 'This account has been suspended. Contact support.' }); return; }

    if (googleIdentity) {
      const alreadyLinked = await store.findProfileByGoogleSub(googleIdentity.googleSub);
      if (alreadyLinked && alreadyLinked.id !== profile.id) {
        res.status(409).json({ error: 'This Google account is linked to a different WASSAA profile. Sign in with that profile’s phone number.' });
        return;
      }
      const linked = await store.linkGoogleIdentity(profile.id, googleIdentity.googleSub, googleIdentity.email);
      if (!linked) { res.status(409).json({ error: 'Could not link this Google account. Contact support if the problem continues.' }); return; }
      profile = await store.getProfile(profile.id) || profile;
    }

    const token = signSession(profile.id, profile.tier);
    res.json({
      success: true,
      isNew: profile.professionCategory === 'Others' && !profile.photos.length,
      sessionToken: token,
      user: serializeProfileForViewer(profile, profile.id, true)
    });
  });

  return router;
}
