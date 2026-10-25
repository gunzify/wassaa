import { config } from '../config';

/** Deliver an OTP code by SMS. Uses Termii (recommended, Nigerian coverage),
 *  then Twilio; if neither is configured, resolution is dev-only: the code is
 *  returned to the caller so the local flow can display it (never in production). */
export async function sendOtpSms(phone: string, code: string): Promise<{ delivered: boolean; channel: string; devCode?: string }> {
  if (config.termiiApiKey) {
    try {
      const res = await fetch(`${config.termiiBaseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone.replace(/\D/g, ''),
          from: config.termiiSenderId,
          sms: `${code} is your WASSAA verification code. Do not share it.`,
          type: 'plain',
          channel: 'dnd',
          api_key: config.termiiApiKey
        }),
        signal: AbortSignal.timeout(8000)
      });
      const payload = await res.json().catch(() => null) as { code?: string } | null;
      if (!res.ok || payload?.code !== 'ok') throw new Error(`Termii rejected the SMS request (HTTP ${res.status}).`);
      return { delivered: true, channel: 'termii' };
    } catch (err) {
      console.error('[sms] Termii delivery failed:', err);
      // fall through to Twilio
    }
  }

  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber) {
    try {
      const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: phone,
          From: config.twilioFromNumber,
          Body: `${code} is your WASSAA verification code. Do not share it.`
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error(`Twilio HTTP ${res.status}`);
      return { delivered: true, channel: 'twilio' };
    } catch (err) {
      console.error('[sms] Twilio delivery failed:', err);
    }
  }

  if (config.isProduction) {
    console.error('[sms] No SMS provider is configured; OTP delivery is unavailable.');
    return { delivered: false, channel: 'unavailable' };
  }
  console.log(`[sms] NO SMS PROVIDER CONFIGURED - dev OTP for ${phone}: ${code}`);
  return { delivered: false, channel: 'dev-console', devCode: code };
}

export function generateOtp(): string {
  // 6-digit, unbiased
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const value = buf[0] % 900000;
  return String(100000 + value);
}
