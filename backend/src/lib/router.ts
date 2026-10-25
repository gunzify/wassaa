import { Router, type RequestHandler } from 'express';

type RouteMethod = 'get' | 'post' | 'patch' | 'put' | 'delete' | 'all';

// Express 4 does not catch rejected promises: an async handler that throws (for
// example, when a database call fails) becomes an unhandled rejection and takes
// the process down. Wrapping every handler forwards the rejection to next() so
// the error middleware can answer with a 500 instead.
function wrapHandler(handler: RequestHandler): RequestHandler {
  if (typeof handler !== 'function' || handler.length >= 4) return handler;
  return (req, res, next) => {
    try {
      const result = handler(req, res, next) as unknown;
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

export function createRouter(): Router {
  const router = Router();
  for (const method of ['get', 'post', 'patch', 'put', 'delete', 'all'] as RouteMethod[]) {
    const original = router[method].bind(router) as (path: string, ...handlers: RequestHandler[]) => Router;
    // Keep Router's declared method types for call sites; only the runtime
    // implementation changes.
    (router as unknown as Record<RouteMethod, unknown>)[method] = (path: string, ...handlers: RequestHandler[]) =>
      original(path, ...handlers.map(wrapHandler));
  }
  return router;
}
