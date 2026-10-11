import type { NextFunction, Request, Response } from 'express';

// Tiny in-memory rate limiter — no dependency. Per-process state is fine for
// PIN-login throttling on a single shop API (Vercel may run several instances;
// each enforces its own window, which only errs toward allowing, never locking out).
const hits = new Map<string, number[]>();

export function rateLimit(windowMs: number, max: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = (req.ip || 'unknown') + ':' + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    // Opportunistic cleanup so the map cannot grow unboundedly
    if (hits.size > 5000) for (const [k, v] of hits) if (v[v.length - 1] < now - windowMs) hits.delete(k);
    if (arr.length > max) return next(Object.assign(new Error('Too many attempts. Wait 15 minutes.'), { status: 429 }));
    next();
  };
}
