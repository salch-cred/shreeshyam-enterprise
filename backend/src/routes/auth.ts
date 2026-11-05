import { createHash, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { signToken } from '../auth.js';
import { env } from '../env.js';
import { rateLimit } from '../ratelimit.js';

export const authRoutes = Router();
// Hash both sides so the comparison is constant time whatever the lengths.
const same = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Admin password → short-lived JWT. It lives only in env, and guesses are throttled.
authRoutes.post('/login', rateLimit(15 * 60 * 1000, 10), (req, res, next) => {
  try {
    const password = String(req.body?.password || '').slice(0, 200);
    if (same(password, env.ADMIN_PASSWORD)) return res.json({ token: signToken('admin'), role: 'admin' });
    next(Object.assign(new Error('Wrong password'), { status: 401 }));
  } catch (e) { next(e); }
});
