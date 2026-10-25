import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Profile } from '../domain';
import { verifySession } from '../lib/jwt';
import { config } from '../config';
import type { Store } from '../store';

export interface Ctx {
  store: Store;
  user: Profile;
}

// Augment Express Request with our context
declare module 'express-serve-static-core' {
  interface Request {
    wassaa?: Ctx & { viewer: Profile };
  }
}

/** Bearer session middleware. 401 when no valid session. */
export function createAuthMiddleware(store: Store) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const claims = token ? verifySession(token) : null;
      if (!claims) {
        res.status(401).json({ error: 'Session expired or missing. Please sign in again.' });
        return;
      }
      const viewer = await store.getProfile(claims.sub);
      if (!viewer || viewer.blockedUs) {
        res.status(401).json({ error: 'Account unavailable.' });
        return;
      }
      req.wassaa = { store, user: viewer, viewer };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Admin guard for manual verification review.
 *  Constant-time comparison: a plain === leaks the key byte-by-byte over timing. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-admin-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || !safeEqual(key, config.adminApiKey)) {
    res.status(401).json({ error: 'Admin key required (x-admin-key).' });
    return;
  }
  next();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
