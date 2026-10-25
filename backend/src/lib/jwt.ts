import jwt from 'jsonwebtoken';
import { config } from '../config';

const SESSION_TTL_DAYS = 30;

export interface SessionClaims {
  sub: string; // profile id
  tier: string;
}

export interface GoogleLinkClaims {
  googleSub: string;
  email: string;
  name?: string;
}

export function signSession(sub: string, tier: string): string {
  return jwt.sign({ sub, tier }, config.sessionJwtSecret, { expiresIn: `${SESSION_TTL_DAYS}d` });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const claims = jwt.verify(token, config.sessionJwtSecret) as unknown;
    if (claims && typeof claims === 'object' && 'sub' in claims) {
      const c = claims as Record<string, unknown>;
      return { sub: String(c.sub), tier: String(c.tier || 'free') };
    }
    return null;
  } catch {
    return null;
  }
}

const GOOGLE_LINK_AUDIENCE = 'wassaa:google-phone-link';

export function signGoogleLinkToken(identity: GoogleLinkClaims): string {
  return jwt.sign(
    { ...identity, purpose: 'google-phone-link' },
    config.sessionJwtSecret,
    { expiresIn: '10m', issuer: 'wassaa-api', audience: GOOGLE_LINK_AUDIENCE }
  );
}

export function verifyGoogleLinkToken(token: string): GoogleLinkClaims | null {
  try {
    const value = jwt.verify(token, config.sessionJwtSecret, {
      algorithms: ['HS256'],
      issuer: 'wassaa-api',
      audience: GOOGLE_LINK_AUDIENCE
    });
    if (!value || typeof value === 'string' || value.purpose !== 'google-phone-link') return null;
    if (typeof value.googleSub !== 'string' || !value.googleSub || typeof value.email !== 'string' || !value.email) return null;
    return {
      googleSub: value.googleSub,
      email: value.email,
      name: typeof value.name === 'string' ? value.name : undefined
    };
  } catch {
    return null;
  }
}
