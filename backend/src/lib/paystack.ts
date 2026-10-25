import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

const PAYSTACK_API = 'https://api.paystack.co';

export interface PaystackInit {
  authorizationUrl: string | null;
  reference: string;
}

/** Create a hosted checkout link for this payment. Returns null URL when the
 *  secret key is not configured (dev sandbox keeps the flow testable). */
export async function initializeTransaction(opts: {
  reference: string;
  amountKobo: number;
  email: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInit> {
  if (!config.paystackSecretKey) {
    console.warn('[paystack] secret key not configured; running in sandbox (no real charge)');
    return { authorizationUrl: null, reference: opts.reference };
  }
  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.paystackSecretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference: opts.reference,
      amount: opts.amountKobo,
      currency: 'NGN',
      email: opts.email,
      callback_url: config.paystackCallbackUrl,
      metadata: opts.metadata
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack initialize failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data?: { authorization_url?: string; reference?: string } };
  return {
    authorizationUrl: data.data?.authorization_url || null,
    reference: data.data?.reference || opts.reference
  };
}

/** Verify the x-paystack-signature header of a webhook call (HMAC SHA512 of the
 *  raw body with the secret key). Compare in constant time. */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !config.paystackSecretKey) return false;
  const expected = createHmac('sha512', config.paystackSecretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
