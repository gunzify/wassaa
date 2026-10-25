import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { config } from '../config';
import { initializeTransaction, verifyWebhookSignature } from '../lib/paystack';
import type { Profile } from '../domain';

// ---------- Catalog (server-side source of truth; see docs/MONETIZATION-ECONOMY.md) ----------
export const PLANS: Record<string, { naira: number; kind: 'one_time'; setsTier?: Profile['tier'] }> = {
  premium: { naira: 1500, kind: 'one_time', setsTier: 'premium' },
  hyper_premium: { naira: 5000, kind: 'one_time', setsTier: 'hyper_premium' }
};

export function plansPayload() {
  return [
    {
      id: 'free', name: 'Free', tagline: 'Meet the community', priceNgn: 0, period: 'free',
      features: ['Browse profiles', 'Like up to 30 profiles per day', '1 Super Like per week']
    },
    {
      id: 'premium', name: 'Premium', tagline: 'More connections', priceNgn: 1500, period: 'one-time', isPopular: true,
      features: ['Unlimited profile likes', '5 Super Likes per week', 'See who liked you']
    },
    {
      id: 'hyper_premium', name: 'Hyper Premium', tagline: 'More Super Likes', priceNgn: 5000, period: 'one-time',
      features: ['Unlimited profile likes', '15 Super Likes per week', 'See who liked you']
    }
  ];
}

export const CONSUMABLES: { id: string; naira: number; description: string }[] = [];

function newReference(): string {
  return `wss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type AuthMw = (req: Request, res: Response, next: import('express').NextFunction) => void | Promise<void>;

export function createBillingRouter(store: import('../store').Store, auth: AuthMw): Router {
  const router = createRouter();

  // Public catalog (no auth)
  router.get('/billing/plans', (_req: Request, res: Response) => {
    res.json({ plans: plansPayload(), consumables: CONSUMABLES });
  });

  /** All member billing routes require a session; webhook + sandbox stay public. */
  const memberAuth: import('express').RequestHandler[] = [auth as unknown as import('express').RequestHandler];

  /** Initialize checkout. Paystack-hosted payment page; webhook completes it. */
  router.post('/billing/checkout', ...memberAuth, async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const planId = String(req.body?.planId || '');
    const plan = PLANS[planId];
    if (!plan) { res.status(400).json({ error: 'Unknown plan.' }); return; }

    const reference = newReference();
    const email = String(req.body?.email || `${viewer.phone.replace(/[^\d]/g, '')}@guest.wassaa.ng`);
    await store.createPayment({
      reference,
      userId: viewer.id,
      planId,
      amountKobo: plan.naira * 100,
      currency: 'NGN',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    try {
      const init = await initializeTransaction({ reference, amountKobo: plan.naira * 100, email, metadata: { planId, userId: viewer.id } });
      if (!init.authorizationUrl) {
        // Sandbox path: no Paystack key configured. Expose a completion endpoint (dev only).
        res.json({
          success: true,
          sandbox: true,
          reference,
          amountNaira: plan.naira,
          message: 'PAYSTACK_SECRET_KEY not configured — payment recorded as pending. Complete via POST /billing/sandbox/complete.',
          sandboxCompleteEndpoint: config.isProduction ? undefined : `${req.baseUrl}/sandbox/complete`
        });
        return;
      }
      res.json({ success: true, reference, authorizationUrl: init.authorizationUrl });
    } catch (err) {
      console.error('[billing] initializeTransaction failed:', err);
      res.status(502).json({ error: 'Payment provider error. Try again shortly.' });
    }
  });

  // ---- Sandbox-only completion (never available in production) ----
  router.post('/billing/sandbox/complete', async (req: Request, res: Response) => {
    if (config.isProduction) { res.status(404).json({ error: 'Not found.' }); return; }
    const reference = String(req.body?.reference || '');
    const payment = await store.getPayment(reference);
    if (!payment) { res.status(404).json({ error: 'Unknown reference.' }); return; }
    await applySuccessfulPayment(store, payment);
    const paid = await store.getPayment(reference);
    res.json({ success: true, payment: paid });
  });

  // ---- Paystack webhook (raw body, HMAC-verified) ----
  router.post('/billing/webhook', async (req: Request, res: Response) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) { res.status(400).json({ error: 'Raw body missing.' }); return; }
    if (!verifyWebhookSignature(raw.toString('utf8'), req.headers['x-paystack-signature'] as string | undefined)) {
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }
    let event: { event?: string; data?: { reference?: string; status?: string; channel?: string } };
    try { event = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ error: 'Invalid JSON.' }); return; }

    if (event.event === 'charge.success' && event.data?.reference && event.data.status === 'success') {
      const payment = await store.getPayment(event.data.reference);
      if (payment) await applySuccessfulPayment(store, payment, event.data.channel);
    }
    // Acknowledge only after the local payment and entitlement update complete;
    // database failures return 500 so Paystack can retry delivery.
    res.json({ received: true });
  });

  /** Server-authoritative entitlements for the caller's tier. */
  router.get('/billing/entitlements', ...memberAuth, (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    res.json(entitlementsFor(viewer.tier));
  });

  // ---- Session-granting upgrade: validates payment then promotes tier ----
  router.post('/billing/activate', ...memberAuth, async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const reference = String(req.body?.reference || '');
    const payment = await store.getPayment(reference);
    if (!payment || payment.userId !== viewer.id) { res.status(404).json({ error: 'Payment not found.' }); return; }
    if (payment.status !== 'success') {
      // In production the webhook is the only add path; until it lands, reject.
      res.status(402).json({ error: 'Payment not confirmed yet. If you just paid, wait a moment and retry.', status: payment.status });
      return;
    }
    const current = await store.getProfile(viewer.id);
    res.json({ success: true, tier: current?.tier || viewer.tier });
  });

  return router;
}

/** Fulfilment: idempotent, server-only. */
export async function applySuccessfulPayment(store: import('../store').Store, payment: { reference: string; planId: string; status: string; userId: string }, channel?: string): Promise<void> {
  const resolved = await store.resolvePayment(payment.reference, 'success', { channel: channel || 'paystack' });
  if (!resolved || resolved.status !== 'success') return;
  const plan = PLANS[payment.planId];
  if (plan.setsTier) {
    const profile = await store.getProfile(payment.userId);
    // Never downgrade an existing higher tier through a lower plan purchase
    const order: Record<string, number> = { free: 0, premium: 1, hyper_premium: 2 };
    if (profile && order[plan.setsTier] > order[profile.tier]) {
      await store.setTier(payment.userId, plan.setsTier);
    }
  }
}

export function entitlementsFor(tier: Profile['tier']) {
  switch (tier) {
    case 'hyper_premium':
      return {
        tier,
        dailyLikes: Infinity, superLikesPerWeek: 15, canSeeLikes: true, canRewind: true,
        incognito: true, privateIntroduction: true, boostsPerMonth: 3, readReceipts: true
      };
    case 'premium':
      return {
        tier,
        dailyLikes: Infinity, superLikesPerWeek: 5, canSeeLikes: true, canRewind: true,
        incognito: false, privateIntroduction: false, boostsPerMonth: 1, readReceipts: false
      };
    default:
      return {
        tier,
        dailyLikes: 30, superLikesPerWeek: 1, canSeeLikes: false, canRewind: false,
        incognito: false, privateIntroduction: false, boostsPerMonth: 0, readReceipts: false
      };
  }
}
