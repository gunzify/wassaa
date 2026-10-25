import dotenv from 'dotenv';

dotenv.config();

function requiredEnv(name: string, optionalInDev = true): string | undefined {
  const value = process.env[name];
  if (!value) {
    if (optionalInDev && process.env.NODE_ENV !== 'production') return undefined;
    if (optionalInDev) return undefined;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  sessionJwtSecret: process.env.SESSION_JWT_SECRET || 'wassaa-dev-insecure-jwt-secret',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  dataBackend: (process.env.DATA_BACKEND || 'memory') as 'memory' | 'supabase',
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',

  termiiApiKey: process.env.TERMII_API_KEY || '',
  termiiSenderId: process.env.TERMII_SENDER_ID || 'WASSAA',
  termiiBaseUrl: (process.env.TERMII_BASE_URL || 'https://api.ng.termii.com').replace(/\/+$/, ''),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',

  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/billing/callback',

  adminApiKey: process.env.ADMIN_API_KEY || 'wassaa-admin-dev-key',

  // Object storage (Cloudflare R2, S3-compatible)
  r2AccountId: process.env.R2_ACCOUNT_ID || '',
  r2Endpoint: process.env.R2_ENDPOINT || '',
  r2Bucket: process.env.R2_BUCKET || 'wassaa',
  r2PublicBucket: process.env.R2_PUBLIC_BUCKET || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),

  isProduction: process.env.NODE_ENV === 'production'
};

/** Storage is only used when every R2 credential is present. */
export function r2Configured(): boolean {
  return Boolean(
    (config.r2Endpoint || config.r2AccountId) &&
      config.r2Bucket &&
      config.r2AccessKeyId &&
      config.r2SecretAccessKey
  );
}

/** Public profile images must use a separate bucket from private verification files. */
export function r2PublicConfigured(): boolean {
  return Boolean(r2Configured() && config.r2PublicBucket && config.r2PublicBucket !== config.r2Bucket && config.r2PublicBaseUrl);
}
