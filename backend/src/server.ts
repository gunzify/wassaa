import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, r2Configured, r2PublicConfigured } from './config';
import type { Store } from './store';
import { getMemoryStore } from './store/memory';
import { getPgStore } from './store/pg';
import { createAuthMiddleware } from './routes/context';
import { createAuthRouter } from './routes/auth';
import { createMeRouter } from './routes/me';
import { createDiscoveryRouter } from './routes/discovery';
import { createSwipesRouter, createMatchesRouter, createBlocksReportsRouter } from './routes/matching';
import { createVerificationRouter } from './routes/verification';
import { createAdminRouter } from './routes/admin';
import { createBillingRouter, plansPayload } from './routes/billing';
import { createUploadsRouter } from './routes/uploads';
import { verifySession } from './lib/jwt';
import { serializeProfileForViewer } from './store';
import { requestLogger, log } from './lib/log';
import { rateLimit } from './lib/rate-limit';

const here = path.dirname(fileURLToPath(import.meta.url));

async function createStore(): Promise<Store> {
  if (config.dataBackend === 'supabase') {
    if (!config.supabaseDbUrl) throw new Error('DATA_BACKEND=supabase but SUPABASE_DB_URL missing.');
    const store = getPgStore(config.supabaseDbUrl);
    await store.init();
    log.info('store connected', { backend: 'supabase' });
    return store;
  }
  const store = getMemoryStore();
  await store.init();
  log.info('store connected', { backend: 'memory', note: 'seeded demo profiles' });
  return store;
}

/** Production must not boot on the documented development defaults. */
function assertProductionConfig(): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (!process.env.SESSION_JWT_SECRET) problems.push('SESSION_JWT_SECRET is unset (dev default in use)');
  if (!process.env.ADMIN_API_KEY || config.adminApiKey === 'wassaa-admin-dev-key') problems.push('ADMIN_API_KEY is unset or the dev default');
  if (config.adminApiKey.length < 24) problems.push('ADMIN_API_KEY should be at least 24 characters');
  if (!config.googleClientId) problems.push('GOOGLE_CLIENT_ID is unset (Google sign-in is unavailable)');
  if (!config.termiiApiKey && !(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber)) {
    problems.push('No SMS provider is configured (Termii or Twilio)');
  }
  if (!config.paystackSecretKey) problems.push('PAYSTACK_SECRET_KEY is unset (live payments are unavailable)');
  if (!r2Configured()) problems.push('R2 storage is not configured (verification media would be stored in the database)');
  if (!r2PublicConfigured()) problems.push('Public profile photos require a separate R2 bucket and public asset domain');
  if (problems.length) {
    for (const p of problems) log.error('config', { problem: p });
    throw new Error('Refusing to start in production with insecure configuration.');
  }
}

function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void {
  if (!origin) return cb(null, true); // same-origin / server-to-server
  if (config.corsOrigins.includes(origin)) return cb(null, true);
  // Development: accept any loopback port, since Vite may pick 5173/5174/...
  if (!config.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  return cb(new Error('Origin not allowed'));
}

async function main(): Promise<void> {
  assertProductionConfig();
  const store = await createStore();
  const auth = createAuthMiddleware(store);

  if (!r2Configured()) {
    log.warn('storage disabled', { hint: 'set R2_* to move ID documents and photos out of the database' });
  }

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestLogger());

  // Security headers. The admin panel gets its own CSP because it renders images.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
    next();
  });

  app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

  // Generous only while media still travels as data-URLs; with R2 the browser
  // uploads directly and request bodies are tiny.
  // Capture Paystack's raw body through body-parser's bounded verify hook. A
  // global data listener would buffer every request before the JSON size limit
  // runs, letting oversized requests consume unbounded memory.
  app.use(express.json({
    limit: r2Configured() ? '1mb' : '8mb',
    verify: (req, _res, body) => {
      if ((req as Request).path === '/api/v1/billing/webhook') {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
      }
    }
  }));

  // ---------- Admin console (static, same-origin) ----------
  const adminDir = path.join(here, '..', 'admin-panel');
  app.use(
    '/admin',
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    express.static(adminDir, { index: 'index.html', dotfiles: 'deny' })
  );

  // ---------- Public ----------
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'wassaa-api',
      dataBackend: config.dataBackend,
      storage: r2Configured(),
      time: new Date().toISOString()
    });
  });
  app.get('/api/v1/billing/plans-public', (_req: Request, res: Response) => res.json(plansPayload()));

  // Admin API carries its own x-admin-key guard; throttle by IP.
  app.use('/api/v1/admin', rateLimit({ name: 'admin:ip', max: 240, windowMs: 60 * 1000 }));
  app.use('/api/v1', createAdminRouter(store));

  app.use('/api/v1', createAuthRouter(store));

  // ---------- Authenticated API ----------
  // ONE guard middleware with a path allowlist. Express runs use()-mounted
  // middleware for every prefix match, so per-router guards would leak onto
  // later public routes; this scopes the bearer check precisely.
  const AUTH_PATH = /^(?:\/(?:me|discovery|likes|passes|matches|blocks|reports|verification|uploads)(?:\/|$)|\/auth\/session$)/;
  const guard: express.RequestHandler = (req, res, next) =>
    AUTH_PATH.test(req.path) ? auth(req, res, next) : next();
  app.use('/api/v1', guard);

  // Coarse ceiling for the whole authenticated surface.
  app.use('/api/v1', rateLimit({ name: 'api', max: 300, windowMs: 60 * 1000 }));

  app.use('/api/v1', createMeRouter(store));
  app.get('/api/v1/auth/session', (async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer;
    if (!viewer) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ user: serializeProfileForViewer(viewer, viewer.id, true) });
  }) as express.RequestHandler);
  app.use('/api/v1', createDiscoveryRouter(store));
  app.use('/api/v1', createSwipesRouter(store));
  app.use('/api/v1', createMatchesRouter(store));
  app.use('/api/v1', createBlocksReportsRouter(store));
  app.use('/api/v1', createVerificationRouter(store));
  app.use('/api/v1', createUploadsRouter());

  app.use('/api/v1', createBillingRouter(store, auth));

  // 404
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
  });

  // Error handler — never leak internals or stack traces to clients.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    log.error('unhandled error', {
      id: req.requestId,
      path: req.path,
      message: err.message,
      stack: config.isProduction ? undefined : err.stack
    });
    if (res.headersSent) return;
    const forbidden = err.message.includes('Origin not allowed');
    res.status(forbidden ? 403 : 500).json({ error: forbidden ? 'Origin not allowed' : 'Internal error', requestId: req.requestId });
  });

  const server = app.listen(config.port, '0.0.0.0', () => {
    log.info('api listening', {
      url: `http://0.0.0.0:${config.port}`,
      env: config.nodeEnv,
      store: config.dataBackend,
      adminPanel: `http://localhost:${config.port}/admin`
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;

  // Graceful shutdown: stop accepting, drain requests, close the pool.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    server.close(() => { /* drained */ });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    try {
      await store.close();
    } catch (err) {
      log.error('store close failed', { message: err instanceof Error ? err.message : String(err) });
    }
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Export for tests / tooling; run when executed directly
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  main().catch((err) => {
    console.error('Fatal: failed to start WASSAA API:', err);
    process.exit(1);
  });
}

export { main as startApi, verifySession };
