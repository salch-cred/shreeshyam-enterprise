import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { signToken } from '../auth.js';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { CustomerLoginIn, RegisterIn } from '../validate.js';
import { rateLimit } from '../ratelimit.js';

export const authRoutes = Router();

// scrypt password hashing — no external dependency.
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

// PIN → short-lived JWT for counter staff. PIN lives only in env.
// 4-digit PINs are brute-forceable, so throttle: 10 tries per 15 min per IP.
authRoutes.post('/login', rateLimit(15 * 60 * 1000, 10), (req, res, next) => {
  try {
    const pin = String(req.body?.pin || '');
    if (pin === env.ADMIN_PIN) return res.json({ token: signToken('admin'), role: 'admin' });
    if (pin === env.BILLING_PIN) return res.json({ token: signToken('billing'), role: 'billing' });
    next(Object.assign(new Error('Wrong PIN'), { status: 401 }));
  } catch (e) { next(e); }
});

// Customer sign-up: name + phone + password. Phone is the identity.
authRoutes.post('/register', rateLimit(60 * 60 * 1000, 8), async (req, res, next) => {
  try {
    const b = RegisterIn.parse(req.body);
    const p = requireDb();
    const dup = await p.query('SELECT 1 FROM users WHERE phone=$1', [b.phone]);
    if (dup.rowCount) return next(Object.assign(new Error('This phone is already registered. Sign in instead.'), { status: 409 }));
    const r = await p.query(
      'INSERT INTO users(name,phone,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,phone',
      [b.name, b.phone, hashPassword(b.password), 'customer']);
    const u = r.rows[0];
    res.status(201).json({ token: signToken('customer', { phone: u.phone, sub: u.id }), name: u.name, phone: u.phone });
  } catch (e) { next(e); }
});

// Customer sign-in: phone + password.
authRoutes.post('/login-customer', rateLimit(15 * 60 * 1000, 12), async (req, res, next) => {
  try {
    const b = CustomerLoginIn.parse(req.body);
    const p = requireDb();
    const r = await p.query('SELECT id,name,phone,password_hash FROM users WHERE phone=$1', [b.phone]);
    const u = r.rows[0];
    if (!u || !verifyPassword(b.password, u.password_hash)) {
      return next(Object.assign(new Error('Wrong phone or password'), { status: 401 }));
    }
    res.json({ token: signToken('customer', { phone: u.phone, sub: u.id }), name: u.name, phone: u.phone });
  } catch (e) { next(e); }
});
