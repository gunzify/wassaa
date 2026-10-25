// In-process rate limiting.
//
// Deliberately dependency-free and single-node: a shared store (Redis) should
// replace this the moment the API runs on more than one instance. Until then it
// closes the obvious holes — OTP/SMS billing abuse, message floods, report spam.
import type { Request, RequestHandler, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000;
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Hard cap so a spoofed-IP flood cannot grow the map without bound.
  if (buckets.size > MAX_KEYS) {
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (buckets.size <= MAX_KEYS) break;
    }
  }
}

export interface ConsumeResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Count one hit against a key. Returns ok=false once the window is exhausted. */
export function consume(key: string, max: number, windowMs: number, now = Date.now()): ConsumeResult {
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  existing.count += 1;
  if (existing.count > max) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: max - existing.count, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Middleware factory. `name` namespaces the bucket so limits do not collide. */
export function rateLimit(opts: {
  name: string;
  max: number;
  windowMs: number;
  by?: (req: Request) => string;
  message?: string;
}): RequestHandler {
  return (req: Request, res: Response, next) => {
    const subject = opts.by ? opts.by(req) : clientIp(req);
    const result = consume(`${opts.name}:${subject}`, opts.max, opts.windowMs);
    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({ error: opts.message || 'Too many requests. Slow down and try again shortly.', retryAfterSeconds: result.retryAfterSeconds });
      return;
    }
    next();
  };
}

/** Per-user limit checked inside a handler (after auth resolved the viewer). */
export function limitForUser(name: string, userId: string, max: number, windowMs: number): ConsumeResult {
  return consume(`${name}:user:${userId}`, max, windowMs);
}

/** For tests: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
