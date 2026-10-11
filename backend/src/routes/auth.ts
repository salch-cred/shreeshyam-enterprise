import { Router } from 'express';
import { signToken } from '../auth.js';
import { env } from '../env.js';
import { rateLimit } from '../ratelimit.js';

export const authRoutes = Router();

// PIN → short-lived JWT. No passwords stored: PIN lives only in env.
// 4-digit PINs are brute-forceable, so throttle: 10 tries per 15 min per IP.
authRoutes.post('/login', rateLimit(15 * 60 * 1000, 10), (req, res, next) => {
  try {
    const pin = String(req.body?.pin || '');
    if (pin === env.ADMIN_PIN) return res.json({ token: signToken('admin'), role: 'admin' });
    if (pin === env.BILLING_PIN) return res.json({ token: signToken('billing'), role: 'billing' });
    next(Object.assign(new Error('Wrong PIN'), { status: 401 }));
  } catch (e) { next(e); }
});
