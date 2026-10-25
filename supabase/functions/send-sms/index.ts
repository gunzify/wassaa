const encoder = new TextEncoder();

function equalConstantTime(a: string, b: string): boolean {
  const left = encoder.encode(a), right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function verifySignature(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get('webhook-id') ?? '';
  const timestamp = req.headers.get('webhook-timestamp') ?? '';
  const seconds = Number(timestamp);
  if (!id || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const encodedSecret = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  let keyBytes: Uint8Array<ArrayBuffer>;
  try { keyBytes = Uint8Array.from(atob(encodedSecret), (c) => c.charCodeAt(0)); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${raw}`));
  const expected = `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
  return (req.headers.get('webhook-signature') ?? '').split(' ').some((s) => equalConstantTime(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET'), apiKey = Deno.env.get('TERMII_API_KEY'), sender = Deno.env.get('TERMII_SENDER_ID');
  if (!secret || !apiKey || !sender) return new Response('SMS provider is not configured', { status: 503 });
  const raw = await req.text();
  if (raw.length > 16_384 || !await verifySignature(req, raw, secret)) return new Response('Invalid hook signature', { status: 401 });
  let event: { user?: { phone?: string }; sms?: { otp?: string } };
  try { event = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const phone = event.user?.phone, otp = event.sms?.otp;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !otp || !/^\d{4,8}$/.test(otp)) return new Response('Invalid SMS event', { status: 400 });
  const termiiBaseUrl = (Deno.env.get('TERMII_BASE_URL') || 'https://api.ng.termii.com').replace(/\/+$/, '');
  const sent = await fetch(`${termiiBaseUrl}/api/sms/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone.replace(/\D/g, ''), from: sender, sms: `${otp} is your WASSAA verification code. Do not share it.`, type: 'plain', channel: 'dnd', api_key: apiKey }),
    signal: AbortSignal.timeout(8_000)
  }).catch(() => null);
  if (!sent) return new Response('SMS delivery failed', { status: 502 });
  const payload = await sent.json().catch(() => null) as { code?: string } | null;
  if (!sent.ok || payload?.code !== 'ok') return new Response('SMS delivery failed', { status: 502 });
  return new Response(null, { status: 200 });
});
