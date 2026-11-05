import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Router } from 'express';
import { signToken } from '../auth.js';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { CustomerLoginIn, RegisterIn } from '../validate.js';
import { rateLimit } from '../ratelimit.js';

export const authRoutes = Router();
const scryptAsync = promisify(scrypt) as (p: string, s: string, n: number) => Promise<Buffer>;

// scrypt password hashing — no external dependency. Async so a login never blocks other requests.
async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), await scryptAsync(pw, salt, 64));
}
// Hash both sides so the comparison is constant time whatever the lengths.
const same = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
// Spent when the phone is unknown, so response time does not reveal which numbers are registered.
const DUMMY = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

// PIN → short-lived JWT for counter staff. PIN lives only in env.
// PINs are brute-forceable, so throttle: 10 tries per 15 min per IP.
authRoutes.post('/login', rateLimit(15 * 60 * 1000, 10), (req, res, next) => {
  try {
    const pin = String(req.body?.pin || '').slice(0, 64);
    if (same(pin, env.ADMIN_PIN)) return res.json({ token: signToken('admin'), role: 'admin' });
    if (same(pin, env.BILLING_PIN)) return res.json({ token: signToken('billing'), role: 'billing' });
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
      'INSERT INTO users(id,name,phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone',
      [randomUUID(), b.name, b.phone, await hashPassword(b.password), 'customer']);
    const u = r.rows[0];
    res.status(201).json({ token: signToken('customer', { phone: u.phone, sub: u.id }), name: u.name, phone: u.phone });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return next(Object.assign(new Error('This phone is already registered. Sign in instead.'), { status: 409 }));
    next(e);
  }
});

// Customer sign-in: phone + password.
authRoutes.post('/login-customer', rateLimit(15 * 60 * 1000, 12), async (req, res, next) => {
  try {
    const b = CustomerLoginIn.parse(req.body);
    const p = requireDb();
    const r = await p.query('SELECT id,name,phone,password_hash FROM users WHERE phone=$1', [b.phone]);
    const u = r.rows[0];
    const ok = await verifyPassword(b.password, u ? u.password_hash : DUMMY);
    if (!u || !ok) return next(Object.assign(new Error('Wrong phone or password'), { status: 401 }));
    res.json({ token: signToken('customer', { phone: u.phone, sub: u.id }), name: u.name, phone: u.phone });
  } catch (e) { next(e); }
});
