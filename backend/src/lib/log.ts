// Minimal structured logging: one JSON object per line, no request bodies and
// no tokens, so logs are safe to ship to a collector.
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields)
};

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/** Request id + one access log line per request. */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.headers['x-request-id']?.toString().slice(0, 64) || crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    const started = Date.now();
    res.on('finish', () => {
      // Skip static assets and the admin panel's own files.
      if (req.path.startsWith('/admin')) return;
      write(res.statusCode >= 500 ? 'error' : 'info', 'request', {
        id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
        ip: req.ip
      });
    });
    next();
  };
}
