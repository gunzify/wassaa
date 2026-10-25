import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from 'node:crypto';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const MAX_TOKEN_LENGTH = 12_000;
const MAX_CERT_CACHE_MS = 6 * 60 * 60 * 1000;

interface GoogleJwk {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

interface GoogleClaims {
  iss?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

export class GoogleKeyServiceError extends Error {
  constructor() {
    super('Google signing keys are temporarily unavailable.');
    this.name = 'GoogleKeyServiceError';
  }
}

let cachedKeys = new Map<string, KeyObject>();
let cacheExpiresAt = 0;
let refreshInFlight: Promise<void> | null = null;

function parsePart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

async function refreshGoogleKeys(force = false): Promise<void> {
  if (!force && cachedKeys.size > 0 && Date.now() < cacheExpiresAt) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    let response: Response;
    try {
      response = await fetch(GOOGLE_CERTS_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new GoogleKeyServiceError();
    }
    if (!response.ok) throw new GoogleKeyServiceError();

    let body: { keys?: GoogleJwk[] };
    try {
      body = await response.json() as { keys?: GoogleJwk[] };
    } catch {
      throw new GoogleKeyServiceError();
    }
    if (!Array.isArray(body.keys)) throw new GoogleKeyServiceError();

    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys) {
      if (!jwk || jwk.kty !== 'RSA' || jwk.use && jwk.use !== 'sig' || jwk.alg && jwk.alg !== 'RS256') continue;
      if (typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
      try {
        next.set(jwk.kid, createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' }));
      } catch {
        // Ignore malformed keys while retaining any valid keys in the response.
      }
    }
    if (next.size === 0) throw new GoogleKeyServiceError();

    const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1];
    const cacheMs = maxAge ? Math.min(Number(maxAge) * 1000, MAX_CERT_CACHE_MS) : 60 * 60 * 1000;
    cachedKeys = next;
    cacheExpiresAt = Date.now() + Math.max(60_000, cacheMs);
  })();

  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Validate a Google OIDC ID token's signature and required identity claims. */
export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleIdentity | null> {
  if (!clientId || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = parsePart<{ alg?: unknown; kid?: unknown }>(parts[0]);
  const claims = parsePart<GoogleClaims>(parts[1]);
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims) return null;

  await refreshGoogleKeys();
  let key = cachedKeys.get(header.kid);
  if (!key) {
    await refreshGoogleKeys(true);
    key = cachedKeys.get(header.kid);
  }
  if (!key) return null;

  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], 'base64url')
    );
  } catch {
    return null;
  }
  if (!signatureValid) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) return null;
  if (audiences.length > 1 && claims.azp !== clientId) return null;
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return null;
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  if (typeof claims.iat !== 'number' || claims.iat > now + 60 || claims.iat > claims.exp) return null;
  if (typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255) return null;
  if (typeof claims.email !== 'string' || claims.email.length > 320 || !claims.email.includes('@')) return null;
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null;

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name.slice(0, 60) : undefined
  };
}
